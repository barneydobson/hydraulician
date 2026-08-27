#!/usr/bin/env python3
"""check_notation.py — assert the codebase speaks one notation.

Zero dependencies; exits non-zero on any failure, so it can gate a commit.
docs/notation.md is the register: `z` vertical, `w` vertical velocity, `d`
depth (`d_c`, `d_n`, `d1`, `d2`), `h` piezometric head, `H` energy head,
pressure head always spelled `p/rho g`. The rename that established it
touched ~100 files, and the failure mode of a rename is not a crash — it is
one stale field name that reads `undefined` in a rig nobody runs until the
morning of the demo. So the retired names are asserted GONE:

  1. retired API fields (.hRaw, .yc, .yn, ynGlobal, .y2p, .fy, probe().head)
  2. gauge objects carry `z:`, never `y:`
  3. the rig wire format is the current version, with z/vz and h/d keys
  4. every gaugeField value in the register is a live key
  5. displayed depth symbols in briefs are the d-family, not the y-family
  6. coordinates quoted in briefs are `z = ...`, not `y = ...`

Deliberately NOT flagged, because they are not this notation at all:
GLSL swizzles (`.xy`, `U.g`) and screen-space pixel coordinates in the view
transform, `y+` wall units, and chart reference lines like `y = 2x`.

Usage:  python3 exercises/_runner/check_notation.py [-v]
"""
import os
import re
import sys

# The symbols this file is about do not survive a cp1252 console.
for stream in (sys.stdout, sys.stderr):
    try:
        stream.reconfigure(encoding="utf-8", errors="replace")
    except AttributeError:                      # pre-3.7, or a redirected pipe
        pass

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Files whose job is to record what the app said ON A GIVEN DATE. Renaming
# inside them would falsify the record, so they are out of scope for every
# check — bench.md included: it is stamped acceptance evidence, and its
# tables are transcripts of what the harness printed that day.
HISTORICAL = ("_code-changes", "_archive", "CHANGES-NEEDED.md",
              "_director-status.md", "check_notation.py",
              "_runner/bench.md")

# The register itself quotes the conventions it did NOT adopt — Chow's y_c,
# the wave-mechanics frame that puts the bed at −d. Flagging those would be
# flagging the argument for the notation.
REGISTER = ("docs/notation.md",)

fails = []
checked = 0


def rel(path):
    return os.path.relpath(path, ROOT).replace("\\", "/")


def historical(path):
    r = rel(path)
    return any(h in r for h in HISTORICAL)


def walk(*globs):
    """Every committed file matching one of the suffixes, minus the record."""
    for base, dirs, files in os.walk(ROOT):
        # `.claude` can hold nested WORKTREES — other branches' source, which
        # is not this checkout's to judge and would be checked on its own.
        dirs[:] = [d for d in dirs
                   if d not in (".git", ".claude", "node_modules", "__pycache__")]
        for f in files:
            p = os.path.join(base, f)
            if historical(p):
                continue
            if any(f.endswith(g) for g in globs):
                yield p


def read(path):
    with open(path, encoding="utf-8") as fh:
        return fh.read()


def scan(paths, pattern, message, allow=()):
    """Fail on every line matching `pattern`, except lines matching `allow`."""
    global checked
    rx = re.compile(pattern)
    skips = [re.compile(a) for a in allow]
    for p in paths:
        checked += 1
        for n, line in enumerate(read(p).splitlines(), 1):
            if not rx.search(line):
                continue
            if any(s.search(line) for s in skips):
                continue
            fails.append("%s:%d  %s\n      %s" % (rel(p), n, message, line.strip()[:96]))


# --- 1. retired API field names ------------------------------------------
# The rename moved these onto the notation; a survivor is a silent undefined.
code = list(walk(".js"))
scan(code, r"\.hRaw\b", "retired field .hRaw — analyse() returns .dRaw")
scan(code, r"\bynGlobal\b", "retired field ynGlobal — analyse() returns dnGlobal")
scan(code, r"\.y2p\b", "retired field .y2p — findJumps() returns .d2p")
scan(code, r"\bA\.(yc|yn|h)\b", "retired analyse() field — use .dc / .dn / .d")
scan(code, r"(?<![\w.])(?:pr|probe|p)\.head\b",
     "retired field .head — probe() returns .phead (pressure head only)")
scan(code, r"\.fy\b", "retired field .fy — boxForce() returns .fz")

# --- 1b. ...and the same names quoted in prose ----------------------------
# The docs name these APIs constantly. A rename that updates the code and
# leaves the prose behind is how a brief ends up telling a student to read a
# field that no longer exists — which is worse than a stale comment, because
# they will type it.
docs = [p for p in walk(".md", ".html") if rel(p) not in REGISTER]
scan(docs, r"probe\([^)]*\)\.head\b|\bpr\.head\b",
     "prose names probe().head — it is probe().phead now")
scan(docs, r"\bynGlobal\b", "prose names ynGlobal — it is dnGlobal now")
scan(docs, r"\bA\.hRaw\b|\bA\.h\[|\bA\.yc\b|\bA\.yn\b",
     "prose names a retired analyse() field — use .d / .dRaw / .dc / .dn")
scan(docs, r"findJumps[^)]*\)\.y[12]\b|\bJ\.y[12]p?\b",
     "prose names a retired findJumps() field — use .d1 / .d2 / .d2p")
scan(docs, r"boxForce[^)]*\)\.fy\b|\breturns?\s+.*\bfy\b.*N/m",
     "prose names boxForce().fy — it is .fz now")

# --- 2. gauge objects carry z ---------------------------------------------
scan(code, r"gauges\.push\(\{[^}]*\by\s*:",
     "gauge object still has a y: key — gauges carry z:")

# --- 3. the rig wire format -----------------------------------------------
rigs_path = os.path.join(ROOT, "js", "exercises-rigs.js")
rigs = read(rigs_path)
checked += 1
versions = set(re.findall(r'"v":\s*(\d+)', rigs))
if versions != {"2"}:
    fails.append("js/exercises-rigs.js  embedded rigs claim version(s) %s, expected {'2'}"
                 % (sorted(versions) or "none"))
for bad, good in (('"y":', '"z":'), ('"vy":', '"vz":'),
                  ('"field": "head"', '"field": "h"'),
                  ('"field": "depth"', '"field": "d"')):
    if bad in rigs:
        fails.append("js/exercises-rigs.js  retired wire key %s — use %s" % (bad, good))

# The app rejects anything but the current version: no back-compat by design,
# so the register and the gate must not drift apart.
main = read(os.path.join(ROOT, "js", "main.js"))
checked += 1
m = re.search(r"const V = (\d+);\s*//\s*format version", main)
if not m:
    fails.append("js/main.js  cannot find the rig format version constant")
elif m.group(1) != "2":
    fails.append("js/main.js  rig format version is v%s but the embedded rigs are v2"
                 % m.group(1))

# --- 4. gauge field keys --------------------------------------------------
LIVE_FIELDS = {"h", "d", "speed"}
register = read(os.path.join(ROOT, "js", "exercises.js"))
checked += 1
for n, line in enumerate(register.splitlines(), 1):
    for val in re.findall(r'gaugeField:\s*"([^"]+)"', line):
        if val not in LIVE_FIELDS:
            fails.append('js/exercises.js:%d  gaugeField: "%s" is not a live key %s'
                         % (n, val, sorted(LIVE_FIELDS)))

# --- 5 & 6. what a student reads -----------------------------------------
# Briefs, the register's card text, and the docs all print the same symbols
# the app does. `y+` is boundary-layer notation and `y = 2x` is a chart line;
# neither is this notation.
prose = [p for p in walk(".md", ".html") if rel(p) not in REGISTER] + [
    os.path.join(ROOT, "js", "exercises.js"),
    os.path.join(ROOT, "js", "exercises-rigs.js"),
]
ALLOW = (r"y\s*=\s*2x", r"y⁺", r"y\+")
scan(prose, r"\by_c\b|\by_n\b|y₁|y₂|y₀|\by_max\b|\by_crest\b|\by_brink\b",
     "retired depth symbol — the displayed set is d, d_c, d_n, d1, d2, z_max",
     allow=ALLOW)
scan(prose, r"y<sub>(?:c|n|0|1|2|max|crest|brink)</sub>",
     "retired depth symbol in HTML — use the d-family",
     allow=ALLOW)
scan(prose, r"(?<![\w.\-])y\s*(?:=|≈)\s*[0-9]",
     "coordinate written as y — the vertical coordinate is z",
     allow=ALLOW)

# -------------------------------------------------------------------------
verbose = "-v" in sys.argv
if fails:
    print("notation check FAILED — %d problem(s):\n" % len(fails))
    for f in fails:
        print("  " + f)
    sys.exit(1)

print("%d files scanned, notation is consistent" % checked)
if verbose:
    print("  register: docs/notation.md")
sys.exit(0)
