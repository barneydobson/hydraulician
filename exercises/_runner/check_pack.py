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
  6. the UI profile: every tool/field/panel id it names actually exists (a
     `view` or `build` list is also matched against the strip's button ids,
     read from js/main.js, because VIEW is a family of toggles and BUILD
     carries Undo and Clear beside its tools), and
     BUILD is not hidden from a card whose task, start or setup tells the
     student to draw, cut, erase or otherwise build something
  7. no orphans in either direction
  9. TABS (one entry, several questions — CR-1): every tab has a unique key
     and a label, an alias collides with no id, and checks 6 and 8 run on
     each tab's VIEW (the entry with the tab merged over it, as EX.view does
     in js/pickers.js), reported as "CR-1#forces"
 10. the short card layout: `steps` holds at most five, and the inline
     markup in steps / background / setup — {tool:id}, {btn:id}, {key:K} —
     names a tool or strip button that exists
  8. a digit rule (or studentParams entry) on a Geometry row -- `geomN` --
     names a param its scene actually declares at index N. The panel binds
     those rows BY INDEX, so a reordered `params` list moves a student's
     slider without a word from the browser; js/scenes.js is parsed the same
     way js/exercises.js is (with js/geom.js in front of it) and the label
     the rule lands on is printed with -v

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


_SCENES_LOADER_JS = r"""
"use strict";
const fs = require("fs");
const src = fs.readFileSync(process.argv[2], "utf8") + "\n" + fs.readFileSync(process.argv[3], "utf8");
const SCENES = new Function(src + "\nreturn SCENES;")();
const out = {};
SCENES.list.forEach((s) => { out[s.id] = (s.params || []).map((p) => ({ key: p.key, label: p.label })); });
process.stdout.write(JSON.stringify(out));
"""


def scene_params():
    """Scene id -> its declared params ([{key, label}, ...]), read out of
    js/scenes.js the way `cards()` reads the register. js/geom.js goes in
    front because scenes.js names GEOM (at call time only, but the constant
    has to exist for the file to evaluate)."""
    fd, loader_path = tempfile.mkstemp(suffix=".js")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(_SCENES_LOADER_JS)
        proc = subprocess.run(["node", loader_path,
                               os.path.join(ROOT, "js", "geom.js"),
                               os.path.join(ROOT, "js", "scenes.js")],
                              capture_output=True, timeout=30, encoding="utf-8")
    finally:
        os.unlink(loader_path)
    if proc.returncode != 0:
        print("node failed to evaluate js/scenes.js as JavaScript:\n" + proc.stderr)
        sys.exit(1)
    try:
        return json.loads(proc.stdout)
    except json.JSONDecodeError as exc:
        print("node did not print JSON for SCENES (%s)" % exc)
        sys.exit(1)


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
# out: it is where a personalised RULE gets explained, and two cards in the
# pack talk about drawing there only to say it is NOT what is happening --
#   UN-3   "your reservoir level is a SLIDER, not a drawing"
#   B8     "d mod 3 gives 0 sharp edge (draw nothing)"
# A negation-aware regex ("not a drawing", "loads with", "draw nothing", ...)
# was the other option, and was rejected: it is exactly one future phrasing
# away from the next false negative, and a maintainer trusting a "no drawing
# here" guard is worse than a maintainer who knows digitNote is simply never
# checked. Each of these has its actual build instruction (if any)
# in task/start/setup, which IS scanned, so nothing about the real defect
# (CS-1, QS-2) is missed by leaving digitNote out.
def draws_text(e):
    setup = e.get("setup") or []
    steps = e.get("steps") or []
    return " ".join([e.get("task") or "", e.get("start") or "", " ".join(setup),
                     " ".join(steps)])


def paras(v):
    """`background` is a string or a list of them."""
    if v is None:
        return []
    return v if isinstance(v, list) else [v]


# The card's inline markup (EX.rich in js/pickers.js): {tool:id} {btn:id} {key:K}.
MARK = re.compile(r"\{(tool|btn|key):([^}\s]+)\}")
TAB_OWN = ("key", "label", "alias")


def tab_view(e, t):
    """The entry as one tab sees it -- the same merge as EX.view in
    js/pickers.js: the tab's fields over the entry's, `viewParams` and `ui`
    merged shallowly, and the tab's ref ("CR-1#forces") as its name."""
    v = dict(e)
    for k, val in t.items():
        if k not in TAB_OWN:
            v[k] = val
    v["viewParams"] = dict(e.get("viewParams") or {}, **(t.get("viewParams") or {}))
    v["ui"] = dict(e.get("ui") or {}, **(t.get("ui") or {}))
    v["_ref"] = "%s#%s" % (e.get("id"), t.get("key"))
    v.pop("tabs", None)
    return v


def views(ex):
    """Every card a student can be shown: each entry, or each of its tabs."""
    out = []
    for e in ex:
        tabs = e.get("tabs")
        if isinstance(tabs, list) and tabs:
            out.extend(tab_view(e, t) for t in tabs if isinstance(t, dict))
        else:
            v = dict(e)
            v["_ref"] = e.get("id")
            out.append(v)
    return out


# Widened from the original {draw, draws, redraw, redraws, erase, sketch}:
# CS-1's task said "Cut your own throttle" (no "erase" in task -- it was one
# setup step down) and QS-2's setup said "Move tank 2's far wall" (no "draw"
# at all). Both had measure-only `instruments`, so the derived profile hid
# BUILD from a card that had just told the student to use it.
DRAWS = re.compile(
    r"\b(draw|draws|drawing|redraw|redraws|erase|sketch|"
    r"cut|cuts|move|widen|narrow|shrink)\b", re.I)


def row_ids():
    """The hover-card row ids, read out of js/overlay.js's ROW_IDS register.

    Parsed rather than duplicated. This check exists to catch a profile naming
    a row that does not exist, and it could not do that honestly against a copy
    of the list that nobody updates."""
    src = open(os.path.join(ROOT, "js", "overlay.js"), encoding="utf-8").read()
    m = re.search(r"const ROW_IDS = \[(.*?)\];", src, re.S)
    if not m:
        print("check_pack.py cannot find ROW_IDS in js/overlay.js -- the hover-card "
              "row register moved or was renamed, and this check will not run blind.")
        sys.exit(1)
    return set(re.findall(r'"([^"]+)"', m.group(1)))


def gauge_ids():
    """The quantities a gauge records, read out of GAUGE_QTY in js/main.js --
    parsed, never copied, for the reason row_ids() gives."""
    src = open(os.path.join(ROOT, "js", "main.js"), encoding="utf-8").read()
    m = re.search(r"const GAUGE_QTY = \[(.*?)\n\];", src, re.S)
    if not m:
        print("check_pack.py cannot find GAUGE_QTY in js/main.js -- the gauge "
              "quantity register moved or was renamed, and this check will not run blind.")
        sys.exit(1)
    return set(re.findall(r'\bid:\s*"([^"]+)"', m.group(1)))


def view_button_ids():
    """The strip's VIEW buttons, read out of the TOOLBAR spec in js/main.js.

    UIMODE matches a `ui.view` list against BUTTON ids (legendBtn, partBtn,
    avgBtn...), not tool ids -- the VIEW family has no pointer tools in it. A
    checker that only knew tool ids would fail every card that narrows VIEW,
    which is a legal and useful thing for a lecture demo to do. Same
    principle as row_ids(): parsed from the source, never copied."""
    src = open(os.path.join(ROOT, "js", "main.js"), encoding="utf-8").read()
    ids = set(re.findall(r'\{\s*id:\s*"([A-Za-z]+Btn)"', src))
    if not ids:
        print("check_pack.py cannot find any `id: \"...Btn\"` in js/main.js -- the "
              "TOOLBAR spec moved or was renamed, and this check will not run blind.")
        sys.exit(1)
    return ids


def panel_control_ids():
    """The row ids in the Controls-panel spec in js/main.js.

    `ui.controls` narrows the panel to individual rows, so a typo there would
    otherwise produce an empty section in front of a class. Keep the checker
    tied to the spec rather than maintaining a second list by hand. Geometry
    rows are generated as `id: "geom" + k`, so derive their numeric suffixes
    from that map's own literal index list as well as reading ordinary ids."""
    src = open(os.path.join(ROOT, "js", "main.js"), encoding="utf-8").read()
    start = src.find("const CONTROLS = [")
    end = src.find("function buildPanel", start)
    if start < 0 or end < 0:
        print("check_pack.py cannot find the CONTROLS spec in js/main.js -- "
              "ui.controls validation cannot run blind.")
        sys.exit(1)
    ids = set(re.findall(r'\bid:\s*"([A-Za-z0-9]+)"', src[start:end]))
    dynamic_geom = re.search(
        r'\.\.\.\[([^\]]+)\]\.map\(\(k\)\s*=>\s*\(\{\s*\n?\s*id:\s*"geom"\s*\+\s*k',
        src[start:end])
    if dynamic_geom:
        ids.update("geom" + n for n in re.findall(r'\d+', dynamic_geom.group(1)))
    # The Boundaries rows are generated the same way, from a literal table
    # whose rows lead with the id: `...[["openL", 0, "Left edge", ...], ...]
    # .map(([id, ...`. Read the first string of each row.
    for table in re.finditer(r'\.\.\.\[(\[.*?\])\]\.map\(\(\[id\b', src[start:end], re.S):
        ids.update(re.findall(r'\[\s*"([A-Za-z0-9]+)"', table.group(1)))
    if not ids:
        print("check_pack.py cannot find any row ids in the CONTROLS spec -- "
              "ui.controls validation cannot run blind.")
        sys.exit(1)
    return ids


def main():
    verbose = "-v" in sys.argv
    ex = cards()
    fail, checked = [], 0
    unverified = []   # cards whose digit ladder this could not locate
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

            else:
                # The card states a base/step rule but no ladder in the one form
                # this recognises, so the rule went UNVERIFIED. Silence here reads
                # as "checked and fine", which is the opposite of what happened.
                # Reported, not failed: how a README lays out a table is its own
                # business, but a maintainer should know the rule was not checked.
                unverified.append(i)

    # 6. the UI profile. An exercise may narrow the interface a student meets
    #    (see UIMODE in js/main.js); what it must not do is narrow away a tool
    #    its own task asks for, or name something that does not exist.
    TOOL_IDS = {"wall", "erase", "valve", "spout", "gauge", "rake", "tracer",
                "measure", "cv", "pour", "flux", "force"}
    FIELD_IDS = {"water", "speed", "ehead", "head", "phead", "p", "vort", "froude", "mom"}
    PANEL = {"full", "focused", "shut"}
    # gauges/cursor/status switch a whole panel; `rows` narrows the hover
    # card to named lines and is validated against ROW_IDS below.
    READOUT_IDS = {"gauges", "cursor", "status", "rows"}
    ROW_IDS = row_ids()
    GAUGE_IDS = gauge_ids()
    # Concepts `ui.hide` can withhold; the honouring sites are listed on
    # UIMODE.hides in js/main.js.
    HIDE_IDS = {"energy", "critical"}
    CONTROL_IDS = panel_control_ids()
    # VIEW is a family of toggle BUTTONS, not tools, so its list is matched
    # against button ids (UIMODE.allows tests both `it.tool` and `it.id`).
    # BUILD carries buttons too -- Undo and Clear -- and a card that narrows
    # BUILD to the tools it draws with has to name Undo to keep it.
    VIEW_IDS = TOOL_IDS | view_button_ids()
    BUILD_TOOLS = {"wall", "erase", "valve", "spout", "pour"}
    # 9. tabs: the structure first; the per-card checks below then run on
    #    every tab's view.
    all_ids = {e.get("id") for e in ex}
    aliases = set()
    for e in ex:
        tabs = e.get("tabs")
        if tabs is None:
            continue
        checked += 1
        i = e.get("id")
        if not isinstance(tabs, list) or not tabs:
            fail.append("%-5s tabs must be a non-empty list" % i)
            continue
        keys = [t.get("key") for t in tabs if isinstance(t, dict)]
        if len(keys) != len(tabs) or not all(isinstance(k, str) and k for k in keys):
            fail.append("%-5s every tab needs a string `key`" % i)
        if len(set(keys)) != len(keys):
            fail.append("%-5s tab keys repeat: %s" % (i, keys))
        for t in tabs:
            if not isinstance(t, dict) or not t.get("label"):
                fail.append("%-5s tab %r has no label" % (i, t.get("key") if isinstance(t, dict) else t))
            a = isinstance(t, dict) and t.get("alias")
            if a:
                if a in all_ids or a in aliases:
                    fail.append("%-5s tab alias %r collides with another id or alias" % (i, a))
                aliases.add(a)
    if aliases & index_ids:
        fail.append("      INDEX.md has rows for tab aliases (they are not cards): %s"
                    % ", ".join(sorted(aliases & index_ids)))

    # 10. the short layout, and the inline markup it uses.
    btn_ids = view_button_ids() | set(re.findall(r'\{\s*id:\s*"([A-Za-z]+Btn)"',
                                       open(os.path.join(ROOT, "js", "main.js"), encoding="utf-8").read()))
    for v in views(ex):
        i = v["_ref"]
        steps = v.get("steps")
        if steps is not None:
            checked += 1
            if not isinstance(steps, list) or not steps:
                fail.append("%-5s steps must be a non-empty list" % i)
            elif len(steps) > 5:
                fail.append("%-5s has %d steps; the short layout holds at most 5 -- move the rest "
                            "into `background`" % (i, len(steps)))
        texts = (v.get("steps") or []) + paras(v.get("background")) + (v.get("setup") or [])
        for txt in texts:
            for kind, ident in MARK.findall(str(txt)):
                checked += 1
                if kind == "tool" and ident not in TOOL_IDS:
                    fail.append("%-5s {tool:%s} names no tool" % (i, ident))
                if kind == "btn" and ident not in btn_ids:
                    fail.append("%-5s {btn:%s} names no strip button" % (i, ident))

    for e in views(ex):
        i, ui = e.get("_ref"), e.get("ui")
        if ui:
            checked += 1
            for fam in ("build", "measure", "view"):
                v = ui.get(fam)
                if isinstance(v, list):
                    known = TOOL_IDS if fam == "measure" else VIEW_IDS
                    bad = [t for t in v if t not in known]
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
            controls = ui.get("controls")
            if isinstance(controls, list):
                if not controls:
                    fail.append("%-5s ui.controls must not be an empty list" % i)
                bad = [c for c in controls if c not in CONTROL_IDS]
                if bad:
                    fail.append("%-5s ui.controls names panel rows that do not exist: %s"
                                % (i, ", ".join(map(str, bad))))
            elif controls is not None and controls is not True:
                fail.append("%-5s ui.controls is %r, not true or a list of row ids"
                            % (i, controls))
            # What a gauge may plot (GAUGE_QTY in js/main.js), the concepts a
            # card withholds (UIMODE.hides), and per-field descriptions.
            gf = ui.get("gaugeFields")
            if gf is not None:
                checked += 1
                if not isinstance(gf, list) or not gf:
                    fail.append("%-5s ui.gaugeFields must be a non-empty list" % i)
                else:
                    bad = [q for q in gf if q not in GAUGE_IDS]
                    if bad:
                        fail.append("%-5s ui.gaugeFields names quantities that do not exist: %s (known: %s)"
                                    % (i, ", ".join(map(str, bad)), ", ".join(sorted(GAUGE_IDS))))
                    gdef = (e.get("viewParams") or {}).get("gaugeField")
                    if gdef is not None and gdef not in gf:
                        fail.append("%-5s viewParams.gaugeField %r is not among ui.gaugeFields"
                                    % (i, gdef))
            hide = ui.get("hide")
            if hide is not None:
                checked += 1
                bad = [h for h in (hide if isinstance(hide, list) else [hide]) if h not in HIDE_IDS]
                if not isinstance(hide, list) or bad:
                    fail.append("%-5s ui.hide must list concepts from %s; got %r"
                                % (i, sorted(HIDE_IDS), hide))
            ft = ui.get("fieldText")
            if ft is not None:
                bad = [k for k in (ft if isinstance(ft, dict) else {}) if k not in FIELD_IDS]
                if not isinstance(ft, dict) or bad:
                    fail.append("%-5s ui.fieldText must map field ids to text; bad: %r" % (i, bad or ft))
            readouts = ui.get("readouts")
            if isinstance(readouts, dict):
                bad = [k for k in readouts if k not in READOUT_IDS]
                if bad:
                    fail.append("%-5s ui.readouts names readouts that do not exist: %s"
                                % (i, ", ".join(bad)))
                # `rows` picks which lines the hover card prints. The ids come
                # out of js/overlay.js's own ROW_IDS register rather than a
                # copy kept here, because a second hand-maintained list is a
                # list that drifts -- and what it would hide is a row that
                # simply never appears in front of a student.
                rws = readouts.get("rows")
                if rws is not None:
                    checked += 1
                    if not isinstance(rws, list) or not rws:
                        fail.append("%-5s ui.readouts.rows must be a non-empty "
                                    "list of row ids" % i)
                    else:
                        bad = [r for r in rws if r not in ROW_IDS]
                        if bad:
                            fail.append("%-5s ui.readouts.rows names rows that do not "
                                        "exist: %s (known: %s)"
                                        % (i, ", ".join(map(str, bad)),
                                           ", ".join(sorted(ROW_IDS))))

        # Gauges a card arrives with already placed (EX.placeCardGauges).
        pg = e.get("gauges")
        if pg is not None:
            checked += 1
            ok_pg = isinstance(pg, list) and 0 < len(pg) <= 4 and all(
                isinstance(g, dict) and isinstance(g.get("x"), (int, float))
                and isinstance(g.get("z"), (int, float))
                and (g.get("field") is None or g.get("field") in GAUGE_IDS) for g in pg)
            if not ok_pg:
                fail.append("%-5s gauges must be 1-4 {x, z, field?} with field from %s"
                            % (i, sorted(GAUGE_IDS)))

        # The derived profile hides BUILD unless the card declares a build
        # tool or says so outright. A task that tells a student to draw, cut,
        # move or erase something and then takes those tools away is the
        # failure this catches, and it is silent in the browser -- the tool
        # is simply not there.
        tools = [t.get("tool") for t in (e.get("instruments") or []) if t.get("tool")]
        declares_build = bool(set(tools) & BUILD_TOOLS) or \
                         bool(ui and (ui.get("build") is True or isinstance(ui.get("build"), list)))
        # Count the check when it RUNS, not when it fails -- every other
        # counter in this file works that way, and a counter that only ticks
        # on failure makes the printed total an undercount of real coverage.
        if DRAWS.search(draws_text(e)):
            checked += 1
        if DRAWS.search(draws_text(e)) and not declares_build:
            fail.append("%-5s task asks the student to draw, but its profile hides "
                        "BUILD -- add `ui: { build: true }` or an instruments entry" % i)

    # 8. Geometry rows bind by index. A rule on geomN with a scene that
    #    declares N params or fewer is a slider that is not there; one on a
    #    scene that declares more may be the wrong one -- both silent in the
    #    browser, both loud here.
    geom_rules = [(e, r) for e in views(ex)
                  for r in ([e.get("digit")] if e.get("digit") else []) +
                           (e.get("digit") or {}).get("also", []) +
                           (e.get("studentParams") or [])
                  if r and re.match(r"^geom\d$", str(r.get("control") or ""))]
    if geom_rules:
        params_by_scene = scene_params()
        for e, r in geom_rules:
            checked += 1
            n = int(r["control"][4:])
            decl = params_by_scene.get(e.get("scene"), [])
            if n >= len(decl):
                fail.append("%-5s %s is on Geometry row %d but scene %r declares only %d param%s"
                            % (e.get("_ref"), r["control"], n, e.get("scene"), len(decl),
                               "" if len(decl) == 1 else "s"))
            elif verbose:
                print("  %-5s %s -> %s (%s)" % (e.get("_ref"), r["control"], decl[n]["key"], decl[n]["label"]))

    # 7. orphans
    for i in sorted(index_ids - {e.get("id") for e in ex}):
        fail.append("%-5s row in INDEX.md with no card in js/exercises.js" % i)
    for d in sorted(os.listdir(os.path.join(ROOT, "exercises"))):
        p = os.path.join(ROOT, "exercises", d)
        if os.path.isdir(p) and not d.startswith("_") and d not in seen_folders:
            fail.append("%-5s exercises/%s/ has no card in js/exercises.js" % ("", d))

    # 8. courses: every courses/<id>/course.js is loaded by index.html, has a
    # unique id, and lists only exercises (or tabs) the register has.
    cdir = os.path.join(ROOT, "courses")
    if os.path.isdir(cdir):
        html = open(os.path.join(ROOT, "index.html"), encoding="utf-8").read()
        ids_ok = {e.get("id") for e in ex}
        tabs_ok = {(e.get("id"), t.get("key")) for e in ex for t in (e.get("tabs") or [])}
        aliases = {t.get("alias") for e in ex for t in (e.get("tabs") or []) if t.get("alias")}
        loader = ("const out=[];global.COURSES={add:(c)=>out.push(c)};"
                  "for(const f of process.argv.slice(1)){eval(require('fs').readFileSync(f,'utf8'));}"
                  "console.log(JSON.stringify(out));")
        files = []
        for d in sorted(os.listdir(cdir)):
            f = os.path.join(cdir, d, "course.js")
            if os.path.isfile(f):
                files.append(f)
                if ('src="courses/%s/course.js"' % d) not in html:
                    fail.append("%-5s courses/%s/course.js is not loaded by index.html" % ("", d))
        if files:
            proc = subprocess.run(["node", "-e", loader] + files, capture_output=True,
                                  timeout=30, encoding="utf-8")
            if proc.returncode != 0:
                fail.append("courses/*/course.js did not evaluate: " + proc.stderr.strip()[:200])
            else:
                seen = set()
                for c in json.loads(proc.stdout):
                    cid = c.get("id")
                    if cid in seen:
                        fail.append("course %r is registered twice" % cid)
                    seen.add(cid)
                    for sec in c.get("sections") or []:
                        for ref in sec.get("ids") or []:
                            checked += 1
                            base, _, tab = ref.partition("#")
                            if tab and (base, tab) not in tabs_ok:
                                fail.append("course %s lists %s: no such tab" % (cid, ref))
                            elif not tab and base not in ids_ok and base not in aliases:
                                fail.append("course %s lists %s: not in the register" % (cid, ref))

    if unverified:
        print("note: no digit ladder found in the recognised table form, so "
              "the base/step rule is UNVERIFIED for: " + ", ".join(unverified))
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
