#!/usr/bin/env python3
"""DA-3 — the sloshing-tank tutorial sheet, generated as two .docx files.

    python3 tutorial-sheet.py

    tutorial-sheet-questions.docx    the student handout
    tutorial-sheet.docx              the tutor copy: the same questions, then an
                                     Answers section (2 s.f.) with the
                                     section 2 table and chart filled in

Needs python-docx, matplotlib, lxml and latex2mathml. Every equation is a
native, editable Word equation (OMML): written here as LaTeX between $…$,
converted to MathML by latex2mathml and to OMML by Word's own stylesheet,
mathml2omml.xsl, which ships inside Microsoft Word ($MML2OMML overrides the
path below).

The measured numbers are the slosh-tank scene at Medium, timed by rig.js
(`DA3.sheet()`) exactly as the card tells a student to: a Depth gauge at
x = 0.5 m, crest to crest, T = (t₄ − t₁)/3. Theory is computed here. Edit
this file, not the documents — rerunning overwrites both.

Notation follows the 4A15 register (docs/notation.md): B the tank length,
d the still-water depth, a the initial tilt (the surface's rise above d at
the end wall), T the period, k the wavenumber of the first mode, and
K = T√(g/d) the dimensionless period.
"""
import math
import os
import re

import latex2mathml.converter
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.shared import Cm, Pt
from lxml import etree

HERE = os.path.dirname(os.path.abspath(__file__))
MML2OMML = os.environ.get("MML2OMML",
                          "/Applications/Microsoft Word.app/Contents/Resources/mathml2omml.xsl")
g = 9.81

# ------------------------------------------------------------ what the app read
# (B, d, a/d) -> the gauge's crest times after release (s), rig.js DA3.sheet()
# at Medium. The gauge's running mean delays every crest by ~0.15 s; timing
# crest to crest cancels it.
APP = {
    (1.0, 1.0, 0.2): [1.339, 2.572, 3.780, 4.932],
    (2.0, 1.0, 0.2): [1.852, 3.588, 5.294, 6.992],
    (4.0, 1.0, 0.2): [2.944, 5.841, 8.666, 11.515],
    (8.0, 1.0, 0.2): [5.126, 10.495, 15.886, 21.241],
    (8.0, 0.5, 0.2): [7.218, 14.724, 22.283, 29.649],
}
# Section 2's models, one per value of B/d: (label, B, d)
RUNS = [("A", 1.0, 1.0), ("B", 2.0, 1.0), ("C", 4.0, 1.0), ("D", 8.0, 1.0), ("E", 8.0, 0.5)]
AD = 0.2                                    # every run's tilt
# Section 2(b): a tank nobody models, read off the chart
PRED = (20.0, 2.5)


def K_theory(B, d):
    kd = math.pi * d / B
    return 2 * math.pi / math.sqrt(kd * math.tanh(kd))


def period(B, d, ad=AD):
    c = APP[(B, d, ad)]
    return (c[-1] - c[0]) / (len(c) - 1)


def K_app(B, d, ad=AD):
    return period(B, d, ad) * math.sqrt(g / d)


def sf(x, n=2):
    """n significant figures, the precision every answer is quoted to."""
    if x == 0:
        return "0"
    e = int(math.floor(math.log10(abs(x))))
    return ("%%.%df" % max(n - 1 - e, 0)) % x


def num(x):
    """A tidy given value: 4, 0.5, 0.25."""
    return "%g" % x


# ------------------------------------------------------------ equations
_XSLT = None
MNS = "http://schemas.openxmlformats.org/officeDocument/2006/math"


def omath(latex):
    """One inline Word equation (an m:oMath element) from a LaTeX string."""
    global _XSLT
    if _XSLT is None:
        _XSLT = etree.XSLT(etree.parse(MML2OMML))
    mml = etree.fromstring(latex2mathml.converter.convert(latex))
    return _XSLT(mml).getroot()


# ------------------------------------------------------------ the figure
def figure(path):
    fig, ax = plt.subplots(figsize=(7.0, 2.4), dpi=200)
    B, d, a, fl = 4.0, 1.0, 0.25, 0.0
    xs = [B * i / 200 for i in range(201)]
    eta = [fl + d + a * math.cos(math.pi * x / B) for x in xs]
    ax.fill_between(xs, [fl] * len(xs), eta, color="#cfe0f3", lw=0)
    ax.plot(xs, eta, color="#17365D", lw=1.6)
    ax.plot([0, B], [fl + d, fl + d], color="#777777", lw=0.8, ls="--")
    for x0, x1 in ((-0.25, 0), (B, B + 0.25)):
        ax.fill_between([x0, x1], [-0.25, -0.25], [1.75, 1.75], color="#dddddd", hatch="////", edgecolor="#777777", lw=0)
    ax.fill_between([-0.25, B + 0.25], [-0.25, -0.25], [0, 0], color="#dddddd", hatch="////", edgecolor="#777777", lw=0)
    ax.plot([0, 0, B, B], [1.75, 0, 0, 1.75], color="#1a1a1a", lw=1.4)
    ax.annotate("", xy=(0, -0.12), xytext=(B, -0.12), arrowprops=dict(arrowstyle="<->", lw=1))
    ax.text(B / 2, -0.2, "B", fontsize=11, style="italic", ha="center", va="top")
    ax.annotate("", xy=(B * 0.62, 0), xytext=(B * 0.62, d), arrowprops=dict(arrowstyle="<->", lw=1))
    ax.text(B * 0.62 + 0.06, d / 2, "d", fontsize=11, style="italic", va="center")
    ax.annotate("", xy=(0.25, d), xytext=(0.25, d + a), arrowprops=dict(arrowstyle="<->", lw=1))
    ax.text(0.31, d + a / 2, "a", fontsize=11, style="italic", va="center")
    ax.plot([0.2], [0.3], "o", mfc="none", mec="#B03A2E", ms=7)
    ax.text(0.29, 0.3, "gauge", fontsize=8, color="#B03A2E", va="center")
    ax.set_xlim(-0.4, B + 0.4); ax.set_ylim(-0.5, 1.8); ax.set_aspect("equal"); ax.axis("off")
    fig.tight_layout(); fig.savefig(path); plt.close(fig)


def chart(path, points=None):
    """The design chart: K against B/d, log-log, with K_theory and the two
    limits of 1(d) and 1(e). Blank for the student; the tutor copy adds the models."""
    fig, ax = plt.subplots(figsize=(5.6, 3.6), dpi=200)
    xs = [10 ** (-0.3 + 1.6 * i / 300) for i in range(301)]
    ax.plot(xs, [K_theory(x, 1.0) for x in xs], color="#17365D", lw=1.6, label=r"$K_\mathrm{theory}$")
    ax.plot(xs, [2 * x for x in xs], color="#999999", lw=0.9, ls="--", label="shallow limit, 1(d)")
    ax.plot(xs, [2 * math.sqrt(math.pi * x) for x in xs], color="#999999", lw=0.9, ls=":", label="deep limit, 1(e)")
    if points:
        ax.plot([p[0] for p in points], [p[1] for p in points], "o", mfc="#B03A2E", mec="#B03A2E", ms=5,
                label=r"$K_\mathrm{app}$")
    ax.set_xscale("log"); ax.set_yscale("log")
    ax.set_xlim(0.5, 20); ax.set_ylim(2, 50)
    ax.set_xticks([0.5, 1, 2, 4, 8, 16]); ax.set_xticklabels(["0.5", "1", "2", "4", "8", "16"])
    ax.set_yticks([2, 5, 10, 20, 50]); ax.set_yticklabels(["2", "5", "10", "20", "50"])
    ax.grid(True, which="both", color="#e5e5e5", lw=0.6)
    ax.set_xlabel(r"$B/d$"); ax.set_ylabel(r"$K = T\sqrt{g/d}$")
    ax.legend(fontsize=8, frameon=False, loc="upper left")
    fig.tight_layout(); fig.savefig(path); plt.close(fig)


# ------------------------------------------------------------ the document
def short_answers(doc, para, ans):
    """The student copy's answer key: results only, no working; exact where
    an exact answer exists, measured values to 2 s.f. otherwise."""
    doc.add_page_break()
    para("Answers", bold=True, size=15, space=6)
    Kp = K_theory(*PRED)
    for lab, text in (
            ("1(a)", "125"),
            ("1(b)", "$T\\sqrt{g/d}$, $B/d$, $a/d$"),
            ("1(c)", "5 models"),
            ("1(d)", "$K=2B/d$"),
            ("1(e)", "$T=C\\sqrt{B/g}$, so $K=C\\sqrt{B/d}$"),
            ("1(f)", "shallow: $K\\to2B/d$; deep: $K\\to2\\sqrt{\\pi}\\sqrt{B/d}$, so $C=2\\sqrt{\\pi}$"),
            ("2", "$K_\\mathrm{app}\\approx$ " + ", ".join(sf(K_app(B, d)) for _, B, d in RUNS)
                  + " for models A–E"),
            ("2(a)", "yes, within a few per cent of $K_\\mathrm{theory}$"),
            ("2(b)", "$K_\\mathrm{theory}=%s$, so $T=%s$ s" % (sf(Kp, 3), sf(Kp * math.sqrt(PRED[1] / g))))):
        ans(lab, text)


def build(answers):
    doc = Document()
    st = doc.styles["Normal"]; st.font.name = "Calibri"; st.font.size = Pt(10.5)

    def runs(p, text, bold=False, italic=False, size=None):
        """Plain text, with every $…$ span made a Word equation."""
        for k, tok in enumerate(re.split(r"\$([^$]+)\$", text)):
            if not tok:
                continue
            if k % 2:
                p._p.append(omath(tok))
            else:
                r = p.add_run(tok); r.bold = bold; r.italic = italic
                if size: r.font.size = Pt(size)

    def para(text, bold=False, italic=False, size=None, align=None, space=4, indent=None):
        p = doc.add_paragraph(); runs(p, text, bold, italic, size)
        if align: p.alignment = align
        if indent: p.paragraph_format.left_indent = Cm(indent)
        p.paragraph_format.space_after = Pt(space)
        return p

    def line(text, space=4):
        """A centred line of its own (equations set apart from the prose)."""
        return para(text, align=WD_ALIGN_PARAGRAPH.CENTER, space=space)

    def display(latex, space=4):
        """A centred display equation (m:oMathPara)."""
        p = doc.add_paragraph(); p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        mp = etree.SubElement(p._p, "{%s}oMathPara" % MNS)
        mp.append(omath(latex))
        p.paragraph_format.space_after = Pt(space)
        return p

    def table(rows):
        t = doc.add_table(rows=len(rows), cols=len(rows[0])); t.style = "Table Grid"
        for i, row in enumerate(rows):
            for j, v in enumerate(row):
                runs(t.cell(i, j).paragraphs[0], v, bold=(i == 0), size=9.5)
        para("", space=2)

    HEAD = ("Model", "$B$ (m)", "$d$ (m)", "$B/d$", "$t_1$ (s)", "$t_4$ (s)", "$T$ (s)", r"$K_\mathrm{app}$")

    para("4A15 Hydraulics · Dimensional analysis", bold=True, size=9)
    para("Tutorial: dimensional analysis and a sloshing tank" + (" — tutor copy" if answers else ""),
         bold=True, size=15, space=6)
    para("A design chart is wanted for the natural sloshing period $T$ of rectangular tanks of length $B$ "
         "holding water to depth $d$. An analyst plans to compute $T$ by creating a set of models, with five "
         "values each of $B$, $d$ and the initial tilt $a$ of the surface (below). Viscosity and surface tension are negligible.")
    fp = os.path.join(HERE, "tank.png"); figure(fp)
    doc.add_picture(fp, width=Cm(15)); doc.paragraphs[-1].alignment = WD_ALIGN_PARAGRAPH.CENTER

    para("1. Dimensional analysis to guide model building", bold=True, size=12)
    para("(a) How many models does the analyst plan?")
    para("(b) $T$ depends on $B$, $d$, $a$, $g$ and the density $\\rho$. Find the Π groups.")
    para("(c) For small tilts the period does not depend on $a$. Show that $T$ can then be written as", space=2)
    line("$T=K\\sqrt{d/g}$, with $K=\\phi(B/d)$,", space=2)
    para("and say how many models the design chart needs.")
    para("(d) In a long, shallow tank the surface disturbance travels at $\\sqrt{gd}$ and goes the length of "
         "the tank and back in one period. Find $K$.")
    para("(e) Deep water is barely disturbed by a wave, so in a deep tank $T$ does not depend on $d$. Use "
         "dimensional analysis to find an expression for $T$ in a deep tank, and write it in terms of $K$ from (c).")
    para("(f) Linear wave theory gives", space=2)
    line("$T=2\\pi/\\sqrt{gk\\ \\tanh(kd)}$, with $k=\\pi/B$.", space=2)
    para("Show that", space=2)
    display("K_\\mathrm{theory}=2\\pi/\\sqrt{kd\\ \\tanh(kd)}", space=2)
    para("depends on $B/d$ only, and that it reduces to (d) and (e).")

    para("2. In the session (exercise DA-3)", bold=True, size=12)
    para("A model gives a period $T$ in seconds for one particular tank. Dividing by $\\sqrt{d/g}$ removes the "
         "tank's size and leaves")
    display("K_\\mathrm{app}=T\\sqrt{g/d}")
    para("a pure number that can be compared directly with any other tank's, and with $K_\\mathrm{theory}$. "
         "By 1(c), one model per value of $B/d$ is enough to draw the analyst's design chart: the five models "
         "below stand in for all 125.")
    para("Place a Depth gauge at $x=0.5$ m, low in the water. For each model set Tank length and Water depth in "
         "Controls → Geometry, with Initial tilt $a/d=0.2$. Expand the gauge (⤢) and read the times $t_1$ and "
         "$t_4$ of the first and fourth crests after release; $T=(t_4-t_1)/3$.", space=6)
    rows = [HEAD]
    for lab, B, d in RUNS:
        rows.append((lab, num(B), num(d), num(B / d), "", "", "", ""))
    table(rows)
    para("Plot $K_\\mathrm{app}$ against $B/d$ on the chart, which shows $K_\\mathrm{theory}$ and the two "
         "limits from 1(d) and 1(e).")
    fc = os.path.join(HERE, "chart.png"); chart(fc)
    doc.add_picture(fc, width=Cm(11)); doc.paragraphs[-1].alignment = WD_ALIGN_PARAGRAPH.CENTER
    para("(a) Do your five points lie on one curve? How well does $K_\\mathrm{theory}$ describe it?")
    para("(b) Without building a model, use the chart to find the period of a tank %s m long holding %s m of "
         "water." % (num(PRED[0]), num(PRED[1])))

    def ans(label, text):
        p = doc.add_paragraph(); runs(p, label + "  ", bold=True); runs(p, text)
        p.paragraph_format.space_after = Pt(5)

    if not answers:
        short_answers(doc, para, ans)
        return doc

    # ---------------------------------------------------------------- answers
    doc.add_page_break()
    para("Answers", bold=True, size=15, space=6)

    ans("1(a)", "$5\\times5\\times5=125$ models.")
    ans("1(b)", "6 variables ($T$, $B$, $d$, $a$, $g$, $\\rho$) and 3 dimensions give 3 groups. $T$ needs only "
                "length and time, so repeat a length and $g$ ($d$ and $g$): $T\\sqrt{g/d}$, $B/d$ and $a/d$. "
                "Mass is redundant: $\\rho$ is the only variable containing it, so no group can include it.")
    ans("1(c)", "$a/d$ drops out, leaving $T\\sqrt{g/d}=\\phi(B/d)$; call it $K$, so $T=K\\sqrt{d/g}$. $K$ is "
                "the period measured in units of $\\sqrt{d/g}$, and it is one curve against $B/d$: 5 models, one "
                "per value of $B/d$.")
    ans("1(d)", "$T=2B/\\sqrt{gd}$, so $K=2B/d$.")
    ans("1(e)", "Without $d$, $T$ depends on $B$ and $g$ only, so $T=C\\sqrt{B/g}$ with $C$ a constant. Then "
                "$K=T\\sqrt{g/d}=C\\sqrt{B/d}$.")
    ans("1(f)", "Multiply $T$ by $\\sqrt{g/d}$: $K_\\mathrm{theory}=2\\pi/\\sqrt{kd\\ \\tanh(kd)}$, with "
                "$kd=\\pi d/B$. Shallow, $kd\\to0$: "
                "$\\tanh kd\\to kd$, so $K\\to2\\pi/kd=2B/d$. Deep, $kd\\to\\infty$: $\\tanh kd\\to1$, so "
                "$K\\to2\\pi/\\sqrt{kd}=2\\sqrt{\\pi}\\sqrt{B/d}$, so the constant in (e) is $C=2\\sqrt{\\pi}=%s$." % sf(2 * math.sqrt(math.pi)))
    ans("2", "")
    rows = [HEAD]
    pts = []
    for lab, B, d in RUNS:
        c = APP[(B, d, AD)]
        rows.append((lab, num(B), num(d), num(B / d), sf(c[0]), sf(c[3]), sf(period(B, d)), sf(K_app(B, d))))
        pts.append((B / d, K_app(B, d)))
    table(rows)
    fc = os.path.join(HERE, "chart-answers.png"); chart(fc, pts)
    doc.add_picture(fc, width=Cm(11)); doc.paragraphs[-1].alignment = WD_ALIGN_PARAGRAPH.CENTER
    errs = [100 * (K_app(B, d) / K_theory(B, d) - 1) for _, B, d in RUNS]
    ans("2(a)", "Yes: one smooth curve, from $K=%s$ at $B/d=1$ to $%s$ at $B/d=16$, although E is a different "
                "size from the others. $K_\\mathrm{app}$ sits %s–%s%% above $K_\\mathrm{theory}$, closest to "
                "the shallow limit for long tanks and turning towards the deep limit for short ones."
                % (sf(K_app(1.0, 1.0)), sf(K_app(8.0, 0.5)), sf(min(errs)), sf(max(errs))))
    Bp, dp = PRED
    Kp = float(sf(K_theory(Bp, dp)))          # what a student reads off the chart, to 2 s.f.
    ans("2(b)", "$B/d=%s$, so $K\\approx%s$ from the chart, and $T=K\\sqrt{d/g}=%s\\times\\sqrt{%s/9.81}"
                "\\approx%s$ s. Exactly, $K_\\mathrm{theory}=%s$ gives $T=%s$ s."
                % (num(Bp / dp), sf(Kp), sf(Kp), num(dp), sf(Kp * math.sqrt(dp / g)),
                   sf(K_theory(Bp, dp), 3), sf(K_theory(Bp, dp) * math.sqrt(dp / g))))
    return doc


def main():
    build(False).save(os.path.join(HERE, "tutorial-sheet-questions.docx"))
    build(True).save(os.path.join(HERE, "tutorial-sheet.docx"))
    for lab, B, d in RUNS:
        print("%s B=%-4g d=%-4g B/d=%-3g T=%.3f K_app=%.3f K_theory=%.3f (%+.1f%%)"
              % (lab, B, d, B / d, period(B, d), K_app(B, d), K_theory(B, d), 100 * (K_app(B, d) / K_theory(B, d) - 1)))


if __name__ == "__main__":
    main()
