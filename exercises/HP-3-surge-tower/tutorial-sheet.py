#!/usr/bin/env python3
"""HP-3 — the pre-session tutorial sheet, generated as tutorial-sheet.docx.

    python3 tutorial-sheet.py            # needs python-docx, and Inkscape (or ImageMagick) for the figure

Every number on the sheet is the hydraulician scene the class runs (HP-3),
so every answer can be checked on screen. The answers — the [Answer: …]
lines under the questions and the appendix for the tutor — are computed
here from the same constants, never typed in, so they cannot drift from the
questions. Edit the text below and rerun; the schematic is drawn by
`scheme_svg()` from the scene's own dimensions, in the style of the
notation sketches in docs/, and saved beside this file as scheme.svg.

THE .DOCX HAS BEEN HAND-EDITED IN WORD BEFORE, AND THIS SCRIPT SILENTLY
OVERWRITES IT. Commit b32638a revised the sheet in Word without touching
this file, and the two drifted apart: three parts in the order penstock →
surge tower → in the session, prose rather than a specification table,
lettered "Find" lists, and an answers appendix whose `app` column is what
the scene actually measured. That layout now lives HERE, together with the
revision that followed it: the terse register of the module's other problem
sheets, an [Answer: …] line under each question, and the NOTATION OF THE
4A15 UNSTEADY FLOW LECTURES — η for the shaft level relative to the
reservoir surface (positive up), V for the mean velocity, k, Y and C as the
lecture's V²–η solution writes them — with λ for the Darcy friction factor
(docs/notation.md reserves f for the fill fraction). The shaft width is ONE
value for the whole class (DS below; the 2.5 + 0.5·d digit ladder was dropped
on 2026-09-15). Keep the two in step — edit this file, not the document.
"""
import math
import os
import re
import tempfile

from docx import Document                             # noqa: E402
from docx.shared import Pt, Cm                        # noqa: E402
from docx.enum.text import WD_ALIGN_PARAGRAPH          # noqa: E402
from docx.enum.table import WD_TABLE_ALIGNMENT        # noqa: E402
from docx.oxml.ns import qn                           # noqa: E402
from docx.oxml import parse_xml                       # noqa: E402
from docx.oxml.ns import nsdecls                      # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "tutorial-sheet.docx")

# ------------------------------------------------------------ the scene
g, rho = 9.81, 1000.0
RES, ZNOZ = 24.9, 3.0                 # reservoir level, nozzle axis (m above datum)
L, DH = 42.4, 3.05                    # headrace: wall to shaft centre, bore
INV = 12.5                            # headrace invert
LP, DP = 20.0, 2.4                    # penstock + tailpipe, bore
GAP = 0.48                            # nozzle opening
Q0, F = 7.6, 0.03                     # discharge per metre width, Darcy f (measured)
ROOF = 35.0
H = RES - ZNOZ
DHH, DHP = 2 * DH, 2 * DP             # hydraulic diameters of a unit-width slot
DS = 3.0                              # surge shaft width, one value for the whole class (the scene's default)

# ------------------------------------------------------------ the answers
u0 = Q0 / DH
vh = u0 * u0 / (2 * g)
hf = F * (L / DHH) * vh
z0 = vh + hf
k = z0 / (u0 * u0)


def crest(Ds, u=u0, zz=z0):
    """Rigid-column crest with quadratic friction, m above the reservoir."""
    kk = zz / (u * u); r = DH / Ds
    Z = L * r / (2 * g * kk); C = -(Z / kk) * math.exp(-zz / Z)
    fz = lambda z: C * math.exp(z / Z) + (z + Z) / kk      # noqa: E731  z positive DOWN
    a, b = -1.5 * u * math.sqrt(L * r / g), 0.0
    for _ in range(100):
        m = 0.5 * (a + b)
        if fz(a) * fz(m) <= 0: b = m
        else: a = m
    return -0.5 * (a + b), Z, C


zf = lambda Ds: u0 * math.sqrt(L * DH / (g * Ds))              # noqa: E731
Tf = lambda Ds: 2 * math.pi * math.sqrt(L * Ds / (g * DH))     # noqa: E731
# the penstock
up = Q0 / DP
hfp = F * (LP / DHP) * up * up / (2 * g)
hft = hf + hfp
ujet = math.sqrt(2 * g * (H - hft))
P0 = rho * g * Q0 * (H - hft)
kt = F * (L / DHH) / (2 * g * DH * DH) + F * (LP / DHP) / (2 * g * DP * DP)
qstar = math.sqrt(H / (3 * kt))
# ------------------------------------------------------------ what the app read
# One settled run and one slam per rung of the ladder, at Medium: settled
# 60 s, read over a 20 s mean, then slammed. These are the appendix's `app`
# column; nothing here is a guess.
APP_U0 = 2.51      # bore-mean velocity mid-headrace
APP_HF = 0.068     # headrace HGL drop over L from the fitted slope
APP_F = 0.030      # the Darcy f that slope implies, D_H = 2 D_h
APP_SLOPE = 1.61e-3
APP_UJET = 20.6    # jet speed just past the nozzle
APP_P = 1.62       # the power that jet carries, MW per metre of width
APP_Z0 = 0.38      # drawdown read on the free surface (η)
APP_Z0SD = 0.02
APP_K = 0.0602     # z0 / u0^2 from those readings
MEAS_CREST = {2.5: 5.22, 3.0: 4.95, 3.5: 4.62, 4.0: 4.23, 4.5: 4.03,       # app crest (m) per shaft width —
              5.0: 3.89, 5.5: 3.75, 6.0: 3.55, 6.5: 3.25, 7.0: 3.31}       # the old per-digit ladder, kept as a record
APP_CREST = MEAS_CREST[DS]


# ------------------------------------------------------------ the figure
# Drawn in the style of docs/notation-heads.svg and notation-reach.svg: white
# paper, hatched bands on the solid side of every wall, water shown by short
# dashes under a free surface, dimension arrows carrying the sheet's symbols
# and nothing the text already says. The SVG is the source (scheme.svg beside
# this file); the docx gets a PNG rasterised from it by Inkscape (ImageMagick
# as a fallback).
SVG_PATH = os.path.join(HERE, "scheme.svg")
FONT = "system-ui,-apple-system,'Segoe UI',sans-serif"
INK, GREY, LINE = "#1a1a1a", "#595959", "#999999"


def scheme_svg():
    S = 10.4                                   # px per metre, true scale
    X = lambda x: 50 + S * x                   # noqa: E731
    Y = lambda z: 56 + S * (ROOF - z)          # noqa: E731  z = ROOF at y = 56
    W, Hpx = 940, 446
    FS = 1.3                                   # type scale: the figure prints at 15.6 cm
    XW, XK = 7.65, 50.0                        # reservoir wall, shaft centre
    XS0, XS1 = XK - DS / 2, XK + DS / 2        # shaft walls
    CROWN = INV + DH
    KNEE, TOE = (XK, 14.0), (60.0, 3.0)        # penstock axis, knee to toe
    hp = DP / 2
    tx, tz = TOE[0] - KNEE[0], TOE[1] - KNEE[1]; ln = math.hypot(tx, tz); tx, tz = tx / ln, tz / ln
    nx, nz = -tz, tx                           # unit normal, towards the upper wall
    slope = -tz / tx                           # dz per −dx along the penstock
    lo0 = (KNEE[0] - hp * nx, KNEE[1] - hp * nz); up0 = (KNEE[0] + hp * nx, KNEE[1] + hp * nz)
    TFLOOR, TCROWN, XN = ZNOZ - hp, ZNOZ + hp, 65.0         # tailpipe floor/crown, nozzle plane
    x_lo_inv = lo0[0] + (lo0[1] - INV) / slope               # lower wall meets the invert
    x_lo_floor = lo0[0] + (lo0[1] - TFLOOR) / slope          # lower wall meets the tailpipe floor
    z_up_wall = up0[1] - slope * (XS1 - up0[0])              # upper wall at the shaft's right wall
    x_up_crown = up0[0] + (up0[1] - TCROWN) / slope          # upper wall meets the tailpipe crown
    ETA0, ETAMAX = -z0, crest(DS)[0]                         # the levels drawn in the shaft
    BAND = 6.0                                               # hatch band, px
    NB = " "

    o = []
    def t(x, y, s, size=11.5, fill=INK, anchor="start", italic=False, extra=""):
        o.append('<text x="%.1f" y="%.1f" text-anchor="%s" font-family="%s" font-size="%.1f"%s fill="%s"%s>%s</text>'
                 % (x, y, anchor, FONT, size * FS, ' font-style="italic"' if italic else "", fill, extra, s))
    def sub(base, idx, rest=""):
        """base with a subscript; blanks beside the subscript are kept (XML would collapse them)."""
        rest = (NB + rest[1:] if rest.startswith(" ") else rest).rstrip(" ") + (NB if rest.endswith(" ") else "")
        return '%s<tspan font-size="%.1f" dy="3">%s</tspan><tspan dy="-3">%s</tspan>' % (base, 9.5 * FS, idx, rest)
    def line(x1, y1, x2, y2, w=1.6, stroke=INK, dash=None, m0=False, m1=False):
        o.append('<line x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f" stroke="%s" stroke-width="%s"%s%s%s/>'
                 % (x1, y1, x2, y2, stroke, w, ' stroke-dasharray="%s"' % dash if dash else "",
                    ' marker-start="url(#ah)"' if m0 else "", ' marker-end="url(#ah)"' if m1 else ""))
    def wall(p, q, n):
        """A solid boundary: dark line plus a hatched band on the solid side (n in metres)."""
        (x1, y1), (x2, y2) = (X(p[0]), Y(p[1])), (X(q[0]), Y(q[1]))
        mx, my = n[0] * BAND, -n[1] * BAND
        o.append('<polygon points="%.1f,%.1f %.1f,%.1f %.1f,%.1f %.1f,%.1f" fill="url(#bh)"/>'
                 % (x1, y1, x2, y2, x2 + mx, y2 + my, x1 + mx, y1 + my))
        line(x1, y1, x2, y2)
    def dim_v(x, z1, z2): line(x, Y(z1), x, Y(z2), 1.2, m0=True, m1=True)
    def dim_h(z, x1, x2): line(X(x1), Y(z), X(x2), Y(z), 1.2, m0=True, m1=True)

    o.append('<svg xmlns="http://www.w3.org/2000/svg" width="%d" height="%d" viewBox="0 0 %d %d" role="img" '
             'aria-label="Definition sketch of the HP-3 hydropower scheme: reservoir, level headrace, surge shaft '
             'open to the air, penstock and nozzle, with the sheet\'s symbols on it.">' % (W, Hpx, W, Hpx))
    o.append('<title>HP-3 — the scheme and its notation</title>')
    o.append('<defs><pattern id="bh" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">'
             '<line x1="0" y1="0" x2="0" y2="5" stroke="#555555" stroke-width="0.8"/></pattern>'
             '<marker id="ah" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7.5" markerHeight="7.5" '
             'orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 Z" fill="%s"/></marker></defs>' % INK)
    o.append('<rect x="0" y="0" width="%d" height="%d" fill="#ffffff"/>' % (W, Hpx))

    # --- the solid: every wall with its hatch band on the ground side ---------
    wall((0, INV), (x_lo_inv, INV), (0, -1))                       # reservoir floor and invert
    wall((x_lo_inv, INV), (x_lo_floor, TFLOOR), (-nx, -nz))        # penstock lower wall
    wall((x_lo_floor, TFLOOR), (70, TFLOOR), (0, -1))              # tailpipe and power-house floor
    wall((x_up_crown, TCROWN), (XN, TCROWN), (0, 1))               # tailpipe crown
    wall((XN, TCROWN), (XN, ROOF), (-1, 0))                        # power-house wall above the nozzle
    wall((XS1, z_up_wall), (x_up_crown, TCROWN), (nx, nz))         # penstock upper wall
    wall((XS1, z_up_wall), (XS1, ROOF), (1, 0))                    # shaft, right wall
    wall((XS0, CROWN), (XS0, ROOF), (-1, 0))                       # shaft, left wall
    wall((XW, CROWN), (XS0, CROWN), (0, 1))                        # headrace crown
    wall((XW, CROWN), (XW, ROOF), (1, 0))                          # reservoir wall
    o.append('<rect x="%.1f" y="%.1f" width="%.1f" height="11" fill="url(#bh)"/>' % (X(0), Y(0) + 1, X(70) - X(0)))
    line(X(0), Y(0), X(70), Y(0), 1.8)                                              # datum
    t(X(0) + 4, Y(0) - 5, "z = 0")
    line(X(0), Y(INV), X(0), Y(ROOF), 1.0, LINE, dash="3 3")                         # the domain edge

    # --- water: free surfaces with dashes; the reservoir level as the reference
    line(X(0), Y(RES), X(XW), Y(RES), 1.8)
    for dz, xs in ((0.7, (0.6, 2.1, 3.7, 5.4, 6.8)), (1.6, (1.3, 2.9, 4.6, 6.1)), (2.5, (2.0, 4.0, 5.7))):
        o.append('<path d="%s" stroke="#444444" stroke-width="0.9" fill="none" opacity="0.85"/>'
                 % " ".join("M%.1f,%.1f h8" % (X(x), Y(RES - dz)) for x in xs))
    line(X(XS0), Y(RES + ETA0), X(XS1), Y(RES + ETA0), 1.8)                         # shaft, steady level
    o.append('<path d="M%.1f,%.1f h7 M%.1f,%.1f h6" stroke="#444444" stroke-width="0.9" fill="none" opacity="0.85"/>'
             % (X(XS0 + 0.35), Y(RES + ETA0 - 0.7), X(XS0 + 1.7), Y(RES + ETA0 - 0.7)))
    line(X(XS0), Y(RES + ETAMAX), X(XS1), Y(RES + ETAMAX), 1.2, dash="3 3")         # first crest
    line(X(0), Y(RES), X(70) + 68, Y(RES), 1.0, LINE, dash="10 3 2 3")
    t(X(XW) + 8, Y(RES) - 6, "reservoir level %.1f m" % RES)
    for z_ in (ZNOZ - GAP / 2, ZNOZ + GAP / 2):                                     # jet
        line(X(XN + 0.25), Y(z_), X(70), Y(z_), 1.2)
    for z_a, z_b in ((TFLOOR, ZNOZ - GAP / 2), (ZNOZ + GAP / 2, TCROWN)):           # nozzle plates
        o.append('<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" fill="%s"/>'
                 % (X(XN - 0.25), Y(z_b), 0.5 * S, (z_b - z_a) * S, INK))

    # --- flow arrows ----------------------------------------------------------
    line(X(17), Y(INV + DH / 2), X(23), Y(INV + DH / 2), 2.2, m1=True)
    t(X(17) - 6, Y(INV + DH / 2) + 5, sub("V", "0"), 14, italic=True, anchor="end")
    line(X(KNEE[0] + 7.6 * tx), Y(KNEE[1] + 7.6 * tz), X(KNEE[0] + 10.6 * tx), Y(KNEE[1] + 10.6 * tz), 2.0, m1=True)
    line(X(66.3), Y(ZNOZ), X(69.4), Y(ZNOZ), 2.0, m1=True)
    t(X(67.9), Y(ZNOZ) - 9, sub("V", "jet"), 13, italic=True, anchor="middle")

    # --- dimensions: L, D_h, D_s, D_p, L_p, H, η ----------------------------------
    for x_ in (XW, XK):
        line(X(x_), Y(INV) - 1, X(x_), Y(10.2), 1.0, LINE, dash="3 3")
    dim_h(10.6, XW, XK)
    t(X((XW + XK) / 2), Y(10.6) + 18, "L = %.1f m" % L, 13, italic=True, anchor="middle")
    dim_v(X(30), INV, CROWN)
    t(X(30) + 6, Y(INV + DH / 2) + 4, sub("D", "h", " = %.2f m" % DH), 13, italic=True)
    line(X(XS0) - 24, Y(34.0), X(XS0), Y(34.0), 1.2, m1=True); line(X(XS1) + 24, Y(34.0), X(XS1), Y(34.0), 1.2, m1=True)
    t(X(XK), Y(ROOF) - 9, sub("D", "s", " = %.1f m" % DS), 13, italic=True, anchor="middle")   # above the walls' top
    cx, cz = KNEE[0] + 0.3 * (TOE[0] - KNEE[0]), KNEE[1] + 0.3 * (TOE[1] - KNEE[1])
    mx_, mz_ = (KNEE[0] + TOE[0]) / 2, (KNEE[1] + TOE[1]) / 2
    line(X(cx - hp * nx), Y(cz - hp * nz), X(cx + hp * nx), Y(cz + hp * nz), 1.2, m0=True, m1=True)
    t(X(cx + 1.9 * nx) + 2, Y(cz + 1.9 * nz), sub("D", "p", " = %.1f m" % DP), 12, italic=True)
    ang = math.degrees(math.atan2(-tz, tx))
    t(X(mx_ - 3.4 * nx), Y(mz_ - 3.4 * nz), sub("L", "p", " ≈ %.0f m" % LP), 11.5, GREY, "middle",
      extra=' transform="rotate(%.1f %.1f %.1f)"' % (ang, X(mx_ - 3.4 * nx), Y(mz_ - 3.4 * nz)))
    xh = X(70) + 46
    line(X(70), Y(ZNOZ), xh + 8, Y(ZNOZ), 1.0, LINE, dash="3 3")
    dim_v(xh, RES, ZNOZ)
    t(xh + 8, Y((RES + ZNOZ) / 2) + 4, "H = %.1f m" % H, 13, italic=True)
    xe = X(XS1) + 16
    dim_v(xe, RES, RES + ETAMAX)
    t(xe + 7, Y(RES + ETAMAX / 2) + 4, sub("η", "max"), 13, italic=True)
    t(xe + 7, Y(RES) + 16, sub("η", "0"), 13, italic=True)
    o.append("</svg>")
    return "\n".join(o)


def scheme(path_png):
    """Write scheme.svg beside this file and rasterise it for the document."""
    import shutil, subprocess
    with open(SVG_PATH, "w", encoding="utf-8") as fh:
        fh.write(scheme_svg())
    inkscape = next((p for p in ("/Applications/Inkscape.app/Contents/MacOS/inkscape", shutil.which("inkscape")) if p and os.path.exists(p)), None)
    if inkscape:
        subprocess.run([inkscape, "--export-type=png", "--export-dpi=300", "-o", path_png, SVG_PATH],
                       check=True, capture_output=True)
    else:
        magick = shutil.which("magick") or shutil.which("convert")
        if not magick:
            raise SystemExit("need Inkscape or ImageMagick to rasterise scheme.svg for the docx")
        subprocess.run([magick, "-density", "300", "-background", "white", SVG_PATH, path_png], check=True)


# ------------------------------------------------------------ the document
doc = Document()
st = doc.styles["Normal"]; st.font.name = "Calibri"; st.font.size = Pt(11)
st.element.rPr.rFonts.set(qn("w:eastAsia"), "Calibri")
for s in doc.sections:
    s.top_margin = s.bottom_margin = Cm(2.0); s.left_margin = s.right_margin = Cm(2.2)

# --- real sub- and superscripts --------------------------------------------
# `D_h`, `η_max`, `V_jet` set the tail after the underscore as a subscript, as
# do the Unicode subscript digits (`V₀`); `²`, `³` and `10⁻³` become
# superscripts. Exponentials are written exp(…) so no script nests in another.
SUBD = str.maketrans("₀₁₂₃₄₅₆₇₈₉", "0123456789")
SUPD = str.maketrans("⁰¹²³⁴⁵⁶⁷⁸⁹⁻", "0123456789−")
TOK = re.compile(r"_([A-Za-z0-9]+)|([₀₁₂₃₄₅₆₇₈₉]+)|([⁰¹²³⁴⁵⁶⁷⁸⁹⁻]+)")


def add_runs(p, text, bold=False, italic=False, size=None, font=None):
    def run(s_, sub=False, sup=False):
        r = p.add_run(s_); r.bold = bold; r.italic = italic
        if size: r.font.size = Pt(size)
        if font: r.font.name = font; r._element.rPr.rFonts.set(qn("w:eastAsia"), font)
        if sub: r.font.subscript = True
        if sup: r.font.superscript = True
    pos = 0
    for m in TOK.finditer(text):
        if m.start() > pos: run(text[pos:m.start()])
        if m.group(1): run(m.group(1), sub=True)
        elif m.group(2): run(m.group(2).translate(SUBD), sub=True)
        else: run(m.group(3).translate(SUPD), sup=True)
        pos = m.end()
    if pos < len(text): run(text[pos:])
    return p


def Hd(text, level=1): return doc.add_heading(text, level=level)


def P(text="", bold=False, italic=False, size=None, align=None, space_after=6, indent=None):
    p = doc.add_paragraph(); add_runs(p, text, bold, italic, size)
    if align is not None: p.alignment = align
    if indent is not None: p.paragraph_format.left_indent = Cm(indent)
    p.paragraph_format.space_after = Pt(space_after); return p


def EQ(text):
    p = doc.add_paragraph(); p.paragraph_format.left_indent = Cm(1.2); p.paragraph_format.space_after = Pt(4)
    return add_runs(p, text, size=11.5, font="Cambria Math")


# --- (a) (b) (c) lists ---------------------------------------------------
# The sheet's "Find" lists are lettered and Word owns the lettering, so an
# item inserted in Word renumbers the rest. python-docx ships no API for that,
# so the numbering definition is written into numbering.xml by hand: one
# abstractNum per list, lowerLetter, "(%1)", with a start so Part 2's second
# list continues at (c) rather than restarting at (a).
W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
LIST_INDENT = 1.9    # cm: the list text's left edge (1077 twips), shared by the answer lines


def letter_list(start=1):
    """A fresh lowerLetter numbering, first item lettered from `start`."""
    num_part = doc.part.numbering_part.element
    aids = [int(e.get(W + "abstractNumId")) for e in num_part.findall(W + "abstractNum")]
    nids = [int(e.get(W + "numId")) for e in num_part.findall(W + "num")]
    aid, nid = (max(aids) + 1 if aids else 0), (max(nids) + 1 if nids else 1)
    an = parse_xml(
        '<w:abstractNum %s w:abstractNumId="%d"><w:multiLevelType w:val="hybridMultilevel"/>'
        '<w:lvl w:ilvl="0"><w:start w:val="%d"/><w:numFmt w:val="lowerLetter"/>'
        '<w:lvlText w:val="(%%1)"/><w:lvlJc w:val="left"/>'
        '<w:pPr><w:ind w:left="1077" w:hanging="360"/></w:pPr></w:lvl></w:abstractNum>'
        % (nsdecls("w"), aid, start))
    num = parse_xml('<w:num %s w:numId="%d"><w:abstractNumId w:val="%d"/></w:num>'
                    % (nsdecls("w"), nid, aid))
    # abstractNum elements must precede num elements in numbering.xml.
    first_num = num_part.find(W + "num")
    (num_part.insert(list(num_part).index(first_num), an) if first_num is not None
     else num_part.append(an))
    num_part.append(num)
    return nid


def ITEM(text, nid, answer=None):
    """One lettered question; `answer` is the italic [Answer: …] line under it,
    the way the module's other problem sheets print theirs."""
    p = doc.add_paragraph(style="List Paragraph")
    pPr = p._p.get_or_add_pPr()
    pPr.append(parse_xml('<w:numPr %s><w:ilvl w:val="0"/><w:numId w:val="%d"/></w:numPr>'
                         % (nsdecls("w"), nid)))
    add_runs(p, text); p.paragraph_format.space_after = Pt(2 if answer else 4)
    if answer:
        P("[" + answer + "]", italic=True, size=10, indent=LIST_INDENT, space_after=6)
    return p


def TABLE(rows, widths, header=True, size=10, keep=False):
    t = doc.add_table(rows=len(rows), cols=len(rows[0])); t.style = "Table Grid"
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    # Word reads the cell widths below; LibreOffice reads the column widths
    # and ignores the cells unless autofit is off. Set all three.
    t.autofit = False
    for j, w in enumerate(widths): t.columns[j].width = Cm(w)
    if keep:
        # A worksheet table that straddles a page break leaves the student
        # filling three rows on an otherwise blank sheet.
        for row in t.rows:
            row._tr.get_or_add_trPr().append(parse_xml("<w:cantSplit %s/>" % nsdecls("w")))
    for i, row in enumerate(rows):
        for j, cell in enumerate(row):
            c = t.cell(i, j); c.width = Cm(widths[j]); c.text = ""
            para = c.paragraphs[0]
            para.paragraph_format.space_after = Pt(0)
            para.paragraph_format.space_before = Pt(0)
            add_runs(para, str(cell), bold=(header and i == 0), size=size)
    # a thin spacer, not a blank line: an 11 pt empty paragraph after each of
    # three tables is three lines, and three lines is what pushed the answers
    # onto a fourth page.
    sp = doc.add_paragraph(); sp.paragraph_format.space_after = Pt(2)
    sp.add_run("").font.size = Pt(4)
    return t


P("Hydropower and unsteady flow — tutorial sheet", bold=True, size=18, space_after=2)
P("Complete by hand before the unsteady flow tutorial. The scheme is hydraulician exercise HP-3, so every answer "
  "can be checked on screen.", italic=True, space_after=10)

# ------------------------------------------------------------ the problem
Hd("The scheme", 1)
fig_path = os.path.join(tempfile.gettempdir(), "hp3-scheme-model.png"); scheme(fig_path)
doc.add_picture(fig_path, width=Cm(15.6)); doc.paragraphs[-1].alignment = WD_ALIGN_PARAGRAPH.CENTER
P("Figure 1: The scheme and its notation, to scale. Heights are metres above the datum z = 0.",
  italic=True, size=10, align=WD_ALIGN_PARAGRAPH.CENTER, space_after=8)
P("Figure 1 shows a hydropower scheme. The reservoir surface stands at %.1f m. A level headrace, L = %.1f m long "
  "and D_h = %.2f m deep, runs to a surge shaft D_s = %.1f m wide, open to the atmosphere; a penstock (D_p = %.1f m, "
  "L_p ≈ %.0f m) drops to a nozzle %.2f m wide at z = %.1f m, discharging to atmosphere. The valve at the nozzle "
  "is the turbine, and closes instantaneously on shutdown. The scheme is a slice one metre wide, so discharges are "
  "per metre of width (m²/s) and a conduit's area is its depth: A = D_h and A_s = D_s."
  % (RES, L, DH, DS, DP, LP, GAP, ZNOZ), space_after=6)
P("Take q₀ = %.1f m²/s, a Darcy friction factor λ = %.2f in both conduits, g = 9.81 m/s² and ρ = 1000 kg/m³, "
  "and neglect local losses. The conduits are slots of depth D and unit width, not circular pipes: the hydraulic "
  "radius is D/2, so the hydraulic diameter 4R_h = 2D takes the place of the pipe diameter in Darcy–Weisbach,"
  % (Q0, F), space_after=4)
EQ("h_f = λ · (L/2D) · V²/2g")

Hd("Notation", 2)
P("V = q/D is the mean velocity in a conduit; H = %.1f − %.1f = %.1f m the gross head, reservoir surface to "
  "nozzle axis; h_f the friction loss. η is the shaft water level relative to the reservoir surface, positive "
  "above it: η₀ (negative) is the steady running level and η_max the first crest. k is the loss coefficient in "
  "η₀ = −k·V₀², and Y = L·A/(2·g·k·A_s)." % (RES, ZNOZ, H), space_after=8)

# ------------------------------------------------------------ part 1
Hd("Part 1: Hydropower — penstock", 1)
P("Energy from the reservoir surface to the jet gives V_jet = √(2g·(H − h_f)), h_f being the friction in headrace "
  "and penstock together, and the power delivered to the nozzle is P = ρ·g·q·(H − h_f). Since V ∝ q in both "
  "conduits, h_f ∝ q².", space_after=4)
P("Find:", space_after=2)
n1 = letter_list()
ITEM("the headrace velocity, V₀;", n1, "Answer: %.2f m/s" % u0)
ITEM("the friction loss along the headrace, h_f;", n1, "Answer: %.3f m" % hf)
ITEM("the jet speed, V_jet;", n1,
     "Answer: V_jet = %.1f m/s" % (ujet))
ITEM("the power P delivered to the nozzle, per metre of width;", n1,
     "Answer: %.2f MW/m" % (P0 / 1e6))
ITEM("the discharge q* at which P would be greatest.", n1,
     "Answer: %.0f m²/s" % qstar)

# ------------------------------------------------------------ part 2
Hd("Part 2: Unsteady flow — surge tower", 1)
P("The shaft carries no flow and is open to the air, so its water stands at the piezometric head at the knee: the "
  "velocity head V₀²/2g plus the friction loss h_f below the reservoir surface. Write this as η₀ = −k·V₀². (The "
  "lectures take k as friction alone, which is fine for a tunnel a thousand bores long; this headrace is 14 bores "
  "long and the velocity head is most of the drawdown.)", space_after=4)
P("Find:", space_after=2)
n2 = letter_list()
ITEM("the steady level in the shaft, η₀;", n2, "Answer: −%.2f m" % z0)
ITEM("the loss coefficient k.", n2, "Answer: %.4f s²/m" % k)
P("After instantaneous shutdown the lecture's V²–η solution gives the first crest, where V = 0, from",
  space_after=4)
EQ("η_max = Y · [1 − exp((η₀ − η_max)/Y)]")
P("Find:", space_after=2)
n3 = letter_list(start=3)
ETAMAX, YY, CC = crest(DS)
ITEM("Y;", n3, "Answer: Y = %.1f m" % YY)
ITEM("η_max, by trial and error.", n3,
     "Hint: bracket the zero of F(η) = η − Y·[1 − exp((η₀ − η)/Y)], as in the lecture example. "
     "Answer: η_max = %.2f m" % ETAMAX)

# ------------------------------------------------------------ part 3
Hd("Part 3 — In the session", 1)
P("Before the session, fill the predicted column from Parts 1 and 2. In the session: hover the headrace "
  "mid-length for V₀ and the jet just past the nozzle for V_jet; set the gauges to Level η and read the "
  "reservoir by the wall and the shaft: η₀ = shaft − reservoir; then switch to d, press V, and read the first "
  "crest's rise above the pre-slam level: η_max = rise + η₀.", space_after=4)
P("Read η₀ on η, not on h: the shaft is open to the air, so its level is the reading you want, and p/ρg part-way "
  "down a slowly circulating column is both noisier and biased. The reservoir slider says 25.0 m while a gauge by "
  "the wall reads the %.1f m the calculation uses. Let the settle finish, and press R before each fresh slam."
  % RES, space_after=6)
TABLE([["quantity", "predicted", "measured"],
       ["V₀ (m/s)", "", ""],
       ["h_f along the headrace (m)", "", ""],
       ["V_jet (m/s)", "", ""],
       ["P (MW per metre of width)", "", ""],
       ["η₀ (m)", "", ""],
       ["k (s²/m)", "", ""],
       ["η_max (m)", "", ""]], [7.0, 4.4, 4.4], keep=True)

# ------------------------------------------------------------ answers
# page_break_before on the heading, not a spacer paragraph carrying a break:
# the spacer lands on its own page whenever the session table happens to fill
# the one before it, and prints a blank sheet between the two halves.
_ans = Hd("Answers (for the tutor)", 1)
_ans.paragraph_format.page_break_before = True
P("Computed from the data in “The scheme”. Two or three significant figures are all the sheet supports. The app "
  "column is one run of the scene at D_s = %.1f m, settled 60 s, read over a 20 s mean and then slammed. "
  "λ = %.2f is the app's own delivered friction: a least-squares fit of the headrace HGL over x = 24–44 m (clear "
  "of the entry recovery) on a 60 s mean gives a slope of %.2f × 10⁻³ at V₀ = %.2f m/s, which is λ = %.3f."
  % (DS, F, APP_SLOPE * 1e3, APP_U0, APP_F), italic=True, space_after=6)
TABLE([["", "Part 1 — Hydropower", "predicted", "app"],
       ["(a)", "V₀ = q₀/D_h = %.1f/%.2f" % (Q0, DH), "%.2f m/s" % u0, "%.2f" % APP_U0],
       ["(b)", "h_f = λ·(L/2D_h)·V₀²/2g = %.2f × (%.1f/%.2f) × %.3f" % (F, L, DHH, vh),
        "%.3f m" % hf, "%.3f  (λ = %.3f)" % (APP_HF, APP_F)],
       ["(c)", "V_jet = √(2g·(H − h_f)), H = %.1f m, h_f = %.3f + %.3f = %.3f m" % (H, hf, hfp, hft),
        "%.1f m/s" % ujet, "%.1f" % APP_UJET],
       ["(d)", "P = ρ·g·q₀·(H − h_f) = ½·ρ·q₀·V_jet²",
        "%.2f MW/m" % (P0 / 1e6), "%.2f" % APP_P],
       ["(e)", "P is greatest at h_f = H/3; since h_f ∝ q², q* = q₀·√(H/3h_f) = %.1f × %.2f"
        % (Q0, qstar / Q0), "%.0f m²/s" % qstar, "—"],
       ["", "Part 2 — Unsteady flow", "predicted", "app"],
       ["(a)", "η₀ = −(V₀²/2g + h_f) = −(%.3f + %.3f)" % (vh, hf), "−%.2f m" % z0,
        "−%.2f ± %.2f" % (APP_Z0, APP_Z0SD)],
       ["(b)", "k = −η₀/V₀²", "%.4f s²/m" % k, "%.4f" % APP_K],
       ["(c)", "Y = L·D_h/(2g·k·D_s)", "%.1f m" % YY, ""],
       ["(d)", "η_max = Y·[1 − exp((η₀ − η_max)/Y)]", "%.2f m" % ETAMAX, "%.2f" % APP_CREST]],
      [1.1, 9.9, 2.6, 2.4], size=9)
P("The app reproduces the calculated crest to %.1f%% (%.2f m against %.2f m). η₀ agrees to 0.5%% when read off "
  "the free surface; read off p/ρg part-way down the shaft it comes out ~0.07 m high and twice as scattered, "
  "which is a property of the reading, not of the friction. Other widths, when the class ran one per digit: "
  "%s." % (100 * abs(APP_CREST / ETAMAX - 1), APP_CREST, ETAMAX,
          ", ".join("%.1f m → %.2f (app %.2f)" % (w, crest(w)[0], m) for w, m in sorted(MEAS_CREST.items()) if w != DS)),
  italic=True)

doc.save(OUT)
print("saved", OUT)
print("1: V0 %.3f  vh %.4f  hf %.4f  hfp %.4f  hft %.4f  Vjet %.2f  P %.3f MW/m  q* %.1f"
      % (u0, vh, hf, hfp, hft, ujet, P0 / 1e6, qstar))
print("2: eta0 %.4f  k %.4f   Ds %.1f: Y %.1f  C %.0f  eta_max %.2f  app %.2f  (frictionless %.2f, T %.1f)"
      % (-z0, k, DS, YY, CC, ETAMAX, APP_CREST, zf(DS), Tf(DS)))
