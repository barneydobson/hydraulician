#!/usr/bin/env python3
r"""check_pack.py — assert the teaching pack agrees with itself.

Zero dependencies; exits non-zero on any failure, so it can gate a commit.
The same exercise is described in several files ON PURPOSE — js/exercises.js
is the register, the rest are prose with different jobs; CLAUDE.md's "pack is
described in four places" note has the reasoning. This asserts the handful of
facts that are derivable from the register and leaves the prose to people:

  1. every card's folder exists, and has a README
  2. the README's H1 id and title match the card
  3. every card has a row in INDEX.md (title text NOT compared — INDEX
     abbreviates on purpose)
  4. when a README states an "about **N s**" countdown, one of them is the
     card's own `settle`
  5. when a card carries a base/step digit rule and the README prints a
     ten-value ladder, the ladder is what the rule produces
  6. the UI profile: every tool/field/panel id it names actually exists, and
     BUILD is not hidden from a card whose task, start or setup tells the
     student to draw, cut, erase or otherwise build something
  7. no orphans in either direction

HOW THIS PARSES js/exercises.js
--------------------------------
The register is handed to `node` (a raw `.js` file, invoked as a script, not
`node -e "..."` — that would need the checkout path, which on a real machine
contains spaces and a dash, shell-quoted correctly on every OS this runs on)
which evaluates the file as real JavaScript and prints `EXERCISES` back out
as JSON. This used to be a set of regexes instead, on the theory that the
file is hand-written in one house style and a dependency here would defeat
the point of a zero-dependency repo. That theory held right up until a card
used a NESTED object — `ui: { readouts: { cursor: false }, build: true }` —
and the naive `ui:\s*\{([^}]*)\}` capture stopped at the FIRST `}`, so
everything after the inner brace (fields, measure, panel, and `build` itself)
silently went unvalidated. `digit: { ... }` had the same class of bug: a
non-greedy `.*?` under DOTALL can wander out of one nested object and into
the next. Braces do not nest under a regex; they do under a parser. Node is
not a new dependency (Node 24 is already this repo's test prerequisite, per
AGENTS.md), so using it to parse actual JavaScript, rather than re-deriving
a JS grammar in Python one edge case at a time, is what "zero dependencies"
was protecting against in the first place — not the other way round.

Usage:  python check_pack.py [-v]
"""
import json
import os
import re
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# exercises.js is a classic <script>-tag file — `const EXERCISES = [...]`,
# no `module.exports`, no `export` — because the whole app has to boot under
# `file://` with no bundler. That means `require()` cannot see it (require
# only ever returns a module's exports, and there are none), and a bare
# `eval(src)` cannot either: a *direct* eval's top-level `const`/`let` create
# bindings scoped to that eval call, which vanish the instant it returns —
# there is nothing left to read `EXERCISES` back from. Wrapping the file's
# source inside `new Function(...)` sidesteps both problems at once: inside a
# function body, a top-level `const` is an ordinary function-scoped
# declaration, so appending `return EXERCISES;` and calling the function
# hands the array straight back out.
#
# `new Function(...)` executes source the same way `eval` would -- safe here
# only because the source is this repo's own checked-in js/exercises.js, not
# untrusted input from a user or the network; this script never runs on
# anything else.
_LOADER_JS = r"""
"use strict";
const fs = require("fs");
const src = fs.readFileSync(process.argv[2], "utf8");
const EXERCISES = new Function(src + "\nreturn EXERCISES;")();
process.stdout.write(JSON.stringify(EXERCISES));
"""


def cards():
    """Return js/exercises.js's EXERCISES array as real Python lists/dicts —
    see the module docstring for why Node does the parsing now."""
    js_path = os.path.join(ROOT, "js", "exercises.js")
    fd, loader_path = tempfile.mkstemp(suffix=".js")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(_LOADER_JS)
        try:
            # Explicit UTF-8, not `text=True` (which decodes with the
            # console's locale encoding -- cp1252 on Windows, which chokes on
            # the ², ·, ₁ and similar symbols the pack's prose is full of).
            proc = subprocess.run(["node", loader_path, js_path],
                                   capture_output=True, timeout=30,
                                   encoding="utf-8")
        except FileNotFoundError:
            print("check_pack.py needs `node` on PATH to parse js/exercises.js "
                  "as real JavaScript (regexes stopped being good enough — see "
                  "the module docstring) -- install Node or add it to PATH.")
            sys.exit(1)
        except subprocess.TimeoutExpired:
            print("node timed out evaluating js/exercises.js")
            sys.exit(1)
    finally:
        os.unlink(loader_path)

    if proc.returncode != 0:
        print("node failed to evaluate js/exercises.js as JavaScript:\n" + proc.stderr)
        sys.exit(1)
    try:
        data = json.loads(proc.stdout)
    except json.JSONDecodeError as exc:
        print("node did not print JSON for EXERCISES (%s)" % exc)
        sys.exit(1)
    if not isinstance(data, list):
        print("EXERCISES did not evaluate to an array")
        sys.exit(1)
    return data


# The prose scanned for "this exercise makes the student build something".
# task, start and setup (an ORDERED list of steps -- joined) are all places a
# worksheet instructs the student directly. digitNote is deliberately left
# out: it is where a personalised RULE gets explained, and three cards in the
# pack talk about drawing there only to say it is NOT what is happening --
#   UN-3   "your reservoir level is a SLIDER, not a drawing"
#   DA-1   "the drawing loads with your digit"        (automatic, not manual)
#   B8     "d mod 3 gives 0 sharp edge (draw nothing)"
# A negation-aware regex ("not a drawing", "loads with", "draw nothing", ...)
# was the other option, and was rejected: it is exactly one future phrasing
# away from the next false negative, and a maintainer trusting a "no drawing
# here" guard is worse than a maintainer who knows digitNote is simply never
# checked. Every one of these three has its actual build instruction (if any)
# in task/start/setup, which IS scanned, so nothing about the real defect
# (CS-1, QS-2) is missed by leaving digitNote out.
def draws_text(e):
    setup = e.get("setup") or []
    return " ".join([e.get("task") or "", e.get("start") or "", " ".join(setup)])


# Widened from the original {draw, draws, redraw, redraws, erase, sketch}:
# CS-1's task said "Cut your own throttle" (no "erase" in task -- it was one
# setup step down) and QS-2's setup said "Move tank 2's far wall" (no "draw"
# at all). Both had measure-only `instruments`, so the derived profile hid
# BUILD from a card that had just told the student to use it.
DRAWS = re.compile(
    r"\b(draw|draws|drawing|redraw|redraws|erase|sketch|"
    r"cut|cuts|move|widen|narrow|shrink)\b", re.I)


def main():
    verbose = "-v" in sys.argv
    ex = cards()
    fail, checked = [], 0
    if not ex:
        print("could not parse any exercise from js/exercises.js")
        return 1

    index_path = os.path.join(ROOT, "exercises", "INDEX.md")
    index_ids = set()
    for line in open(index_path, encoding="utf-8"):
        c = [x.strip() for x in line.split("|")]
        if len(c) > 2 and re.match(r'^[A-Z]{1,2}-?\d+$', c[1]):
            index_ids.add(c[1])

    seen_folders = set()
    for e in ex:
        i, folder = e.get("id"), e.get("folder")
        seen_folders.add(folder)
        d = os.path.join(ROOT, "exercises", folder or "")
        readme = os.path.join(d, "README.md")
        if not folder or not os.path.isdir(d):
            fail.append("%-5s folder missing: exercises/%s" % (i, folder))
            continue
        if not os.path.isfile(readme):
            fail.append("%-5s no README.md in exercises/%s" % (i, folder))
            continue
        txt = open(readme, encoding="utf-8").read()

        # 2. H1 id + title
        h1 = re.match(r'#\s*([A-Z0-9\-]+)\s*·\s*(.+)', txt.split("\n", 1)[0].strip())
        if not h1:
            fail.append("%-5s README H1 is not '# <ID> · <title>'" % i)
        else:
            checked += 1
            if h1.group(1) != i:
                fail.append("%-5s README H1 says id %s" % (i, h1.group(1)))
            if h1.group(2).strip() != e.get("title"):
                fail.append("%-5s title differs\n        card:   %s\n        README: %s"
                            % (i, e.get("title"), h1.group(2).strip()))

        # 3. INDEX row
        if i not in index_ids:
            fail.append("%-5s has no row in exercises/INDEX.md" % i)
        else:
            checked += 1

        # 4. settle vs the stated countdown. `is not None` on purpose: GV-2
        # carries `settle: 0`, which is a real, meaningful value (nothing to
        # wait out) and must not be treated the same as "no settle at all".
        # Its README is free to print no "about **N s**" line either -- that
        # is not a failure, it just means this check has nothing to compare.
        nums = [int(x) for x in re.findall(r'about\s+\*\*(\d+)\s*s\*\*', txt, re.S)]
        if e.get("settle") is not None and nums:
            checked += 1
            if e["settle"] not in nums:
                fail.append("%-5s card settle=%ds but README states %s s"
                            % (i, e["settle"], nums))

        # 5. digit ladder vs base/step (only the horizontal ten-value form)
        digit = e.get("digit") or {}
        base, step = digit.get("base"), digit.get("step")
        if base is not None:
            row = re.search(r'\|\s*\*\*[^*]*\*\*\s*\|((?:\s*-?[\d.]+\s*\|){10})', txt)
            if row:
                checked += 1
                vals = [round(float(v), 6) for v in row.group(1).split("|") if v.strip()]
                want = [round(float(base) + float(step) * k, 6) for k in range(10)]
                if vals != want:
                    fail.append("%-5s digit ladder differs\n        rule:   %s\n        README: %s"
                                % (i, want, vals))

    # 6. the UI profile. An exercise may narrow the interface a student meets
    #    (see UIMODE in js/main.js); what it must not do is narrow away a tool
    #    its own task asks for, or name something that does not exist.
    TOOL_IDS = {"wall", "erase", "valve", "spout", "gauge", "rake", "tracer",
                "measure", "cv", "pour"}
    FIELD_IDS = {"water", "speed", "ehead", "head", "phead", "vort", "froude", "mom"}
    PANEL = {"full", "focused", "shut"}
    READOUT_IDS = {"gauges", "cursor", "status"}
    BUILD_TOOLS = {"wall", "erase", "valve", "spout", "pour"}
    for e in ex:
        i, ui = e.get("id"), e.get("ui")
        if ui:
            checked += 1
            for fam in ("build", "measure", "view"):
                v = ui.get(fam)
                if isinstance(v, list):
                    bad = [t for t in v if t not in TOOL_IDS]
                    if bad:
                        fail.append("%-5s ui.%s names tools that do not exist: %s"
                                    % (i, fam, ", ".join(bad)))
            fields = ui.get("fields")
            if isinstance(fields, list):
                bad = [f for f in fields if f not in FIELD_IDS]
                if bad:
                    fail.append("%-5s ui.fields names fields that do not exist: %s"
                                % (i, ", ".join(bad)))
            panel = ui.get("panel")
            if panel is not None and panel not in PANEL:
                fail.append("%-5s ui.panel is %r, not one of %s"
                            % (i, panel, sorted(PANEL)))
            readouts = ui.get("readouts")
            if isinstance(readouts, dict):
                bad = [k for k in readouts if k not in READOUT_IDS]
                if bad:
                    fail.append("%-5s ui.readouts names readouts that do not exist: %s"
                                % (i, ", ".join(bad)))

        # The derived profile hides BUILD unless the card declares a build
        # tool or says so outright. A task that tells a student to draw, cut,
        # move or erase something and then takes those tools away is the
        # failure this catches, and it is silent in the browser -- the tool
        # is simply not there.
        tools = [t.get("tool") for t in (e.get("instruments") or []) if t.get("tool")]
        declares_build = bool(set(tools) & BUILD_TOOLS) or \
                         bool(ui and (ui.get("build") is True or isinstance(ui.get("build"), list)))
        if DRAWS.search(draws_text(e)) and not declares_build:
            checked += 1
            fail.append("%-5s task asks the student to draw, but its profile hides "
                        "BUILD -- add `ui: { build: true }` or an instruments entry" % i)

    # 7. orphans
    for i in sorted(index_ids - {e.get("id") for e in ex}):
        fail.append("%-5s row in INDEX.md with no card in js/exercises.js" % i)
    for d in sorted(os.listdir(os.path.join(ROOT, "exercises"))):
        p = os.path.join(ROOT, "exercises", d)
        if os.path.isdir(p) and not d.startswith("_") and d not in seen_folders:
            fail.append("%-5s exercises/%s/ has no card in js/exercises.js" % ("", d))

    print("%d exercises, %d assertions" % (len(ex), checked))
    if verbose:
        for e in ex:
            print("  %-5s %-28s %s" % (e.get("id"), e.get("scene"), e.get("title")))
    if fail:
        print("\n%d PROBLEM%s:" % (len(fail), "" if len(fail) == 1 else "S"))
        for f in fail:
            print("  " + f)
        return 1
    print("pack is self-consistent")
    return 0


if __name__ == "__main__":
    sys.exit(main())
