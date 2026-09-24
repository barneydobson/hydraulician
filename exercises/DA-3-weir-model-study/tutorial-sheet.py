#!/usr/bin/env python3
"""DA-3 — the weir model study tutorial sheet, generated as two .docx files.

    python3 tutorial-sheet.py        # needs python-docx and matplotlib

    tutorial-sheet-questions.docx    the student handout
    tutorial-sheet.docx              the tutor copy: the same questions with an
                                     [Answer: …] line under each and the
                                     measured column filled in

Every number on the sheet is the DA-3 rig the class runs, so every answer can
be checked on screen. The answers are computed here from the same constants,
never typed in, so they cannot drift from the questions; the `APP_*` values
are what the app measured (README, "Measured column"). Edit this file, not the
documents — rerunning overwrites both.

Notation follows the 4A15 register (hydraulician docs/notation.md): L_r is the
model-to-prototype length ratio (λ is reserved for the Darcy friction factor),
Δh the head over the crest (H is the energy head), P the crest height, q the
discharge per metre width, C_d = q/(√g·Δh^1.5).
"""
import math
import os
import re

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.shared import Cm, Pt

HERE = os.path.dirname(os.path.abspath(__file__))

# ------------------------------------------------------------ the rig (L_r = 1)
g, rho, nu, sigma = 9.81, 1000.0, 1.0e-6, 0.073
DX = 9 / 414                      # Medium cell on the sandbox, m
P = 32 * DX                       # crest height above the bed: 0.696 m
LC = 80 * DX                      # crest length: 1.739 m
QP = 0.78                         # prototype discharge per metre width, m²/s
LAMS = (1.0, 0.5, 0.25)
LEVEL = {1.0: 1.891, 0.5: 1.195, 0.25: 0.848}       # reservoir level paired with q (rig rule)
STATION = {1.0: 2.17, 0.5: 1.09, 0.25: 0.54}        # gauge x, m
SETTLE_P = 55.0                                     # prototype settle, s

# ------------------------------------------------------------ what the app read
# Medium, settled then 8 s of median depth in the approach pool (README).
APP_D = {1.0: 1.3894, 0.5: 0.6939, 0.25: 0.3469}    # gauge d above the bed, m


def rung(lam):
    q = QP * lam ** 1.5
    Pm = P * lam
    H = APP_D[lam] - Pm
    cd = q / (math.sqrt(g) * H ** 1.5)
    return dict(lam=lam, q=q, P=Pm, Lc=LC * lam, H=H, cd=cd,
                Hpred=lam * (APP_D[1.0] - P),
                ReH=math.sqrt(g) * H ** 1.5 / nu, WeH=rho * g * H * H / sigma,
                cells=H / DX, settle=SETTLE_P * math.sqrt(lam))


R = {lam: rung(lam) for lam in LAMS}
CD_IDEAL = (2 / 3) ** 1.5
H_IDEAL = (QP / (CD_IDEAL * math.sqrt(g))) ** (2 / 3)
H_MIN = 0.030
LAM_MIN_ST = H_MIN / R[1.0]["H"]
LAM_MIN_GRID = 8 * DX / R[1.0]["H"]


def f(x, n=3):
    return ("%%.%df" % n) % x


def sci(x):
    """2 significant figures as a × 10^{n}, in the sheet's own markup."""
    e = int(math.floor(math.log10(abs(x))))
    return "%.1f × 10^{%d}" % (x / 10 ** e, e)


# ------------------------------------------------------------ the figure
def figure(path):
    fig, ax = plt.subplots(figsize=(7.2, 2.6), dpi=200)
    bed, crest = 0.5, 0.5 + P
    xb, xe = 220 * DX, 300 * DX
    surf = APP_D[1.0] + 0.5
    ax.fill_between([-0.3, xe], [-0.2, -0.2], [bed, bed], color="#dddddd", hatch="////", edgecolor="#777777", lw=0)
    ax.fill_between([xb, xe], [bed, bed], [crest, crest], color="#dddddd", hatch="////", edgecolor="#777777", lw=0)
    ax.plot([-0.3, xb, xb, xe, xe], [bed, bed, crest, crest, -0.2], color="#1a1a1a", lw=1.4)
    xs = [0.0, 3.2, 4.4, xb + 0.1, xb + 0.8, xe]
    zs = [surf, surf, surf - 0.01, crest + 0.62 * (surf - crest), crest + 0.52 * (surf - crest), crest + 0.40 * (surf - crest)]
    ax.plot(xs, zs, color="#17365D", lw=1.6)
    ax.annotate("", xy=(3.2, crest), xytext=(3.2, surf), arrowprops=dict(arrowstyle="<->", lw=1))
    ax.text(3.28, (crest + surf) / 2, r"$\Delta h$", fontsize=11, va="center")
    ax.plot([3.0, xb], [crest, crest], color="#999999", lw=0.8, ls="--")
    ax.annotate("", xy=(xb - 0.25, bed), xytext=(xb - 0.25, crest), arrowprops=dict(arrowstyle="<->", lw=1))
    ax.text(xb - 0.2, (bed + crest) / 2, "P", fontsize=11, style="italic", va="center")
    ax.annotate("", xy=(xb, crest + 0.12), xytext=(xe, crest + 0.12), arrowprops=dict(arrowstyle="<->", lw=1))
    ax.text((xb + xe) / 2, crest + 0.17, r"$L_c$", fontsize=11, ha="center")
    ax.annotate("q", xy=(1.2, 0.9), xytext=(0.3, 0.9), fontsize=11, style="italic", va="center",
                arrowprops=dict(arrowstyle="->", lw=1.2))
    ax.plot([STATION[1.0]], [0.5 + 0.75], "o", mfc="none", mec="#B03A2E", ms=7)
    ax.text(STATION[1.0] - 0.1, 0.5 + 0.93, "gauge", fontsize=8, color="#B03A2E", ha="right")
    ax.set_xlim(-0.3, 7.2); ax.set_ylim(-0.2, 2.2); ax.set_aspect("equal"); ax.axis("off")
    fig.tight_layout(); fig.savefig(path); plt.close(fig)


# ------------------------------------------------------------ the document
def build(answers):
    doc = Document()
    st = doc.styles["Normal"]; st.font.name = "Calibri"; st.font.size = Pt(10.5)

    def runs(p, text, bold=False, italic=False, size=None):
        """Plain text with ^{…} superscripts and _{…} / _word subscripts."""
        for tok in re.split(r"(\^\{[^}]*\}|_\{[^}]*\}|_[A-Za-z]+)", text):
            if not tok:
                continue
            sup = tok.startswith("^{"); sub = tok.startswith("_")
            body = tok[2:-1] if (sup or tok.startswith("_{")) else (tok[1:] if sub else tok)
            r = p.add_run(body); r.bold = bold; r.italic = italic
            if size: r.font.size = Pt(size)
            r.font.superscript = sup; r.font.subscript = sub

    def para(text, bold=False, italic=False, size=None, align=None, space=4):
        p = doc.add_paragraph(); runs(p, text, bold, italic, size)
        if align: p.alignment = align
        p.paragraph_format.space_after = Pt(space)
        return p

    def answer(text):
        if answers:
            p = para("[Answer: " + text + "]", italic=True, space=6)

    para("4A15 Hydraulics · Dimensional analysis", bold=True, size=9)
    para("Tutorial: a weir model study" + (" — tutor copy" if answers else ""), bold=True, size=15, space=6)
    para("A broad-crested weir is to be studied with Froude-scaled physical models at 1:2 and 1:4. "
         "The prototype, drawn to scale in the hydraulician app (exercise DA-3), has crest height "
         "P = %s m above the approach bed and crest length L_c = %s m, and passes q_p = %s m²/s per metre width. "
         "Answer Questions 1–3 before the session; Question 4 is done in the app; 5 and 6 afterwards."
         % (f(P), f(LC), f(QP, 2)))
    fp = os.path.join(HERE, "weir.png"); figure(fp)
    doc.add_picture(fp, width=Cm(15.5)); doc.paragraphs[-1].alignment = WD_ALIGN_PARAGRAPH.CENTER

    para("1. Dimensional analysis", bold=True, size=12)
    para("The discharge per metre width q over the weir depends on the head Δh, the crest height P, the crest "
         "length L_c, gravity g, and the water's density ρ, viscosity μ and surface tension σ.")
    para("(a) How many Π groups describe the problem? Using ρ, g and Δh as repeating variables, find them.")
    answer("m = 8 variables, n = 3 dimensions, so 5 groups: q/(g^{1/2}Δh^{3/2}), P/Δh, L_c/Δh, "
           "μ/(ρg^{1/2}Δh^{3/2}) and σ/(ρgΔh^{2}).")
    para("(b) Hence show that q = C_d √g Δh^{3/2} with C_d = φ(Δh/P, L_c/Δh, Re, We), where "
         "Re = ρ√g Δh^{3/2}/μ and We = ρgΔh²/σ. Which force ratio does each of Re and We compare?")
    answer("Invert the fourth and fifth groups (any power of a group is a group). With √(gΔh) as the velocity "
           "scale, Re = ρ√(gΔh)Δh/μ is inertia/viscous and We = ρ(gΔh)Δh/σ is inertia/surface tension.")

    para("2. Designing the models", bold=True, size=12)
    para("(a) Which dimensionless group must be the same in model and prototype for gravity-dominated flow "
         "over a weir, and why can Re and We not be matched at the same time with water in both?")
    answer("The Froude number, which for a weir is the group q/(g^{1/2}Δh^{3/2}) = C_d itself, with the geometric ratios Δh/P and L_c/Δh: gravity drives the flow over the crest. With the "
           "same g, ρ, μ and σ, Froude scaling makes Re fall as L_{r}^{3/2} and We as L_{r}²; neither can be held.")
    para("(b) For L_{r} = ½ and L_{r} = ¼ find the model crest height, crest length and the discharge per metre width "
         "that must be supplied. (In this vertical slice q is per metre, so it scales as L_{r}^{3/2}, not L_{r}^{5/2}.)")
    answer("; ".join("L_{r} = %s: P = %s m, L_c = %s m, q = %s m²/s" % (("½" if l == 0.5 else "¼"), f(R[l]["P"]),
                     f(R[l]["Lc"]), f(R[l]["q"], 4)) for l in (0.5, 0.25)) + ".")
    para("(c) The prototype takes about %d s to settle to steady flow. How long should each model take?"
         % SETTLE_P)
    answer("Times scale as √L_{r}: %d s at L_{r} = ½ and %d s at L_{r} = ¼ (the card's 40 and 28 s)."
           % (round(R[0.5]["settle"]), round(R[0.25]["settle"])))

    para("3. Predictions", bold=True, size=12)
    para("(a) For an ideal broad-crested weir (critical depth over a long crest, no losses, approach velocity "
         "neglected) q = (2/3)^{3/2} √g Δh^{3/2}. Predict the prototype head from q_p.")
    answer("C_{d,ideal} = %s; Δh = (q/(0.544√g))^{2/3} = %s m." % (f(CD_IDEAL), f(H_IDEAL)))
    para("(b) If the prototype head turns out to be Δh_p, what heads do you predict for the two models, and what "
         "C_d? Write the relationship; you will fill in the numbers in the session.")
    answer("Δh_m = L_{r}Δh_p and C_{d,m} = C_{d,p} (Froude similarity with geometric similarity keeps every Π group except "
           "Re and We).")

    para("4. In the app (exercise DA-3)", bold=True, size=12)
    para("For each rung (the box on the card: 0 = prototype, 1 = 1:2, 2 = 1:4) set Inflow q to your value "
         "from 2(b) (0.780 m²/s for the prototype) and the Reservoir level printed on the card, press R, wait for "
         "the settle, then read the steady approach-pool depth d on a gauge at the card's station. "
         "Compute Δh = d − P and C_d, and complete the table.")
    rows = [("", "prototype L_{r} = 1", "1:2 model", "1:4 model"),
            ("q (m²/s)",) + tuple(f(R[l]["q"], 4) for l in LAMS),
            ("P (m)",) + tuple(f(R[l]["P"]) for l in LAMS),
            ("d measured (m)",) + tuple((f(APP_D[l], 4) if answers else "") for l in LAMS),
            ("Δh = d − P (m)",) + tuple((f(R[l]["H"], 4) if answers else "") for l in LAMS),
            ("Δh predicted = L_{r}Δh_p (m)",) + tuple((f(R[l]["Hpred"], 4) if answers else "") for l in LAMS),
            ("C_{d}",) + tuple((f(R[l]["cd"], 4) if answers else "") for l in LAMS)]
    t = doc.add_table(rows=len(rows), cols=4); t.style = "Table Grid"
    for i, row in enumerate(rows):
        for j, v in enumerate(row):
            runs(t.cell(i, j).paragraphs[0], v, bold=(i == 0 or j == 0), size=9.5)
    para("", space=2)
    answer("The models reproduce the prototype to within %.1f%% in Δh and %.1f%% in C_d: the three rungs are "
           "Froude-similar. The measured C_d (%s) is %d%% below the ideal %s."
           % (max(abs(R[l]["H"] / R[l]["Hpred"] - 1) for l in (0.5, 0.25)) * 100,
              max(abs(R[l]["cd"] / R[1.0]["cd"] - 1) for l in (0.5, 0.25)) * 100,
              f(R[1.0]["cd"]), round((1 - R[1.0]["cd"] / CD_IDEAL) * 100), f(CD_IDEAL)))

    para("5. Scale effects", bold=True, size=12)
    para("(a) Evaluate Re and We for the prototype and both models, with ν = 1.0×10⁻⁶ m²/s and "
         "σ = 0.073 N/m. Would a real 1:4 model of this weir, in water, suffer from viscous or surface-tension "
         "scale effects?")
    answer("; ".join("L_{r} = %s: Re = %s, We = %s" % (("1" if l == 1 else "½" if l == 0.5 else "¼"),
                     sci(R[l]["ReH"]), sci(R[l]["WeH"])) for l in LAMS) +
           ". All are large (fully turbulent, surface tension negligible), so a 1:4 model is safe.")
    para("(b) A lower limit often used for model weir heads is a few centimetres; take 30 mm. What is the "
         "smallest scale at which this weir could be modelled?")
    answer("L_{r} = 0.030/%s = %s, about 1:%d." % (f(R[1.0]["H"]), f(LAM_MIN_ST), round(1 / LAM_MIN_ST)))

    para("6. The simulation's own scale effect", bold=True, size=12)
    para("The app has no real viscosity or surface tension at these scales; its equivalent is the grid. Its "
         "cells are Δx = 21.7 mm at Medium and do not shrink with the model. How many cells span Δh on each "
         "rung? If Δh needs at least about 8 cells to be resolved, what is the smallest model this simulation "
         "can represent at Medium? What would you expect to happen to C_d at L_{r} = ¼ on a coarser grid?")
    answer("Δh spans %s, %s and %s cells. L_{r,min} = 8Δx/Δh_p = %s, i.e. the 1:4 rung is right at the limit. A "
           "coarser grid (Resolution Low) puts H_¼ under 6 cells and moves C_d by a few per cent with nothing "
           "physical changed: the numerical counterpart of Re and We falling below their thresholds."
           % (f(R[1.0]["cells"], 0), f(R[0.5]["cells"], 0), f(R[0.25]["cells"], 0), f(LAM_MIN_GRID, 2)))
    return doc


def main():
    build(False).save(os.path.join(HERE, "tutorial-sheet-questions.docx"))
    build(True).save(os.path.join(HERE, "tutorial-sheet.docx"))
    for l in LAMS:
        r = R[l]
        print("λ=%-5s q=%.4f P=%.4f H=%.4f pred=%.4f (%+.2f%%) Cd=%.4f ReH=%.3g WeH=%.3g cells=%.1f settle=%.0f"
              % (l, r["q"], r["P"], r["H"], r["Hpred"], 100 * (r["H"] / r["Hpred"] - 1), r["cd"],
                 r["ReH"], r["WeH"], r["cells"], r["settle"]))
    print("ideal Cd %.4f H %.4f; λ_min(30 mm) %.3f; λ_min(8 cells) %.3f" % (CD_IDEAL, H_IDEAL, LAM_MIN_ST, LAM_MIN_GRID))


if __name__ == "__main__":
    main()
