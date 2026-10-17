#!/usr/bin/env python3
r"""check_pack.py — assert the teaching pack agrees with itself.

Zero dependencies; exits non-zero on any failure, so it can gate a commit.
The same exercise is described in several files ON PURPOSE — the register
(js/exercises.js declares it, empty; every courses/<id>/exercises.js appends
its cards) is the machine-readable source, the rest are prose with different
jobs; AGENTS.md's "pack is described in four places" note has the reasoning.
This asserts the handful of facts that are derivable from the register and
leaves the prose to people (a card's folder and INDEX are its course's:
courses/<id>/exercises/<folder>/ and courses/<id>/INDEX.md):

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
 11. courses: every course.js / exercises.js is loaded by index.html, ids
     are unique across every course, a course file registers cards only under
     its own id, `hosts` are well-formed and claimed once, every id a menu
     lists exists, and every card a course owns is in its own menu (with no
     course the menu was the whole register, so nothing could go missing;
     a course menu is a hand-written list, so this is the guard)

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
#
# COURSES. A course may own cards (courses/<id>/exercises.js, which calls
# COURSES.exercises(id, [...]) to append them to the same EXERCISES list), so
# the register is no longer one file. The loader below therefore runs the
# files the way index.html does — js/exercises.js, js/courses.js, then each
# course's course.js and exercises.js — as separate classic scripts sharing
# one global scope (`vm.runInThisContext` gives exactly a browser's
# script-tag semantics: a top-level `const` of one script is visible to the
# next). The real js/courses.js runs, so the `course` / `home` stamps and the
# duplicate-id refusals are the app's own, not a re-implementation. Which
# cards each course file added is recorded, so a course registering cards
# under another course's id is caught.
_LOADER_JS = r"""
"use strict";
const fs = require("fs"), vm = require("vm");
global.window = global;
global.location = { search: "", hostname: "" };
const files = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const run = (f) => vm.runInThisContext(fs.readFileSync(f, "utf8"), { filename: f });
const added = {};
// Every COURSES.add call, in order -- the registry is a Map, so a course
// registered twice would otherwise show up once.
global.__adds = [];
let patched = false;
for (const f of files) {
  const before = vm.runInThisContext("typeof EXERCISES === 'undefined' ? 0 : EXERCISES.length");
  run(f.path);
  if (!patched && vm.runInThisContext("typeof COURSES !== 'undefined'")) {
    vm.runInThisContext("{ const add = COURSES.add; COURSES.add = (c) => { __adds.push(c); add(c); }; }");
    patched = true;
  }
  if (f.course) {
    const now = vm.runInThisContext("EXERCISES");
    added[f.course] = (added[f.course] || []).concat(now.slice(before).map((e) => e.id + "@" + (e.course || "")));
  }
}
const has = (n) => vm.runInThisContext("typeof " + n + " !== 'undefined'");
process.stdout.write(JSON.stringify({
  exercises: vm.runInThisContext("EXERCISES"),
  courses: __adds,
  rejected: has("COURSES") ? vm.runInThisContext("COURSES.rejected") : [],
  added: added,
}));
"""


def course_dirs():
    """courses/<id>/ folders, sorted (the order index.html is checked in)."""
    cdir = os.path.join(ROOT, "courses")
    if not os.path.isdir(cdir):
        return []
    return [d for d in sorted(os.listdir(cdir))
            if os.path.isdir(os.path.join(cdir, d)) and not d.startswith((".", "_"))]


def register_files():
    """The scripts that build the register, in index.html's order."""
    out = [{"path": os.path.join(ROOT, "js", "exercises.js")},
           {"path": os.path.join(ROOT, "js", "courses.js")}]
    for d in course_dirs():
        for name in ("course.js", "exercises.js"):
            p = os.path.join(ROOT, "courses", d, name)
            if os.path.isfile(p):
                out.append({"path": p, "course": d if name == "exercises.js" else None})
    return out


_LOADED = None


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


def loaded():
    """Run the register's scripts once (see _LOADER_JS) and return
    {exercises, courses, rejected, added}."""
    global _LOADED
    if _LOADED is None:
        _LOADED = _load()
    return _LOADED


def cards():
    """Return the whole register — js/exercises.js's EXERCISES with every
    course's own cards appended — as real Python lists/dicts. See the module
    docstring for why Node does the parsing now."""
    return loaded()["exercises"]


def _load():
    fd, loader_path = tempfile.mkstemp(suffix=".js")
    fd2, list_path = tempfile.mkstemp(suffix=".json")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(_LOADER_JS)
        with os.fdopen(fd2, "w", encoding="utf-8") as f:
            json.dump(register_files(), f)
        try:
            # Explicit UTF-8, not `text=True` (which decodes with the
            # console's locale encoding -- cp1252 on Windows, which chokes on
            # the ², ·, ₁ and similar symbols the pack's prose is full of).
            proc = subprocess.run(["node", loader_path, list_path],
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
        os.unlink(list_path)

    if proc.returncode != 0:
        print("node failed to evaluate the register (js/exercises.js, js/courses.js, "
              "courses/*/course.js, courses/*/exercises.js) as JavaScript:\n" + proc.stderr)
        sys.exit(1)
    try:
        data = json.loads(proc.stdout)
    except json.JSONDecodeError as exc:
        print("node did not print JSON for EXERCISES (%s)" % exc)
        sys.exit(1)
    if not isinstance(data.get("exercises"), list):
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

    # Where each card lives. A course's card (COURSES.exercises stamped
    # `course` and `home`): its folder under courses/<id>/exercises/, its row
    # in courses/<id>/INDEX.md. Every card is a course's now; a card pushed
    # straight into js/exercises.js (no `home`) would still be held to
    # exercises/<folder>/ and exercises/INDEX.md. The guarantees are the same.
    def home_of(e):
        return e.get("home") or "exercises"

    def index_of(e):
        return "courses/%s/INDEX.md" % e["course"] if e.get("course") else "exercises/INDEX.md"

    def index_rows(rel_path):
        ids = set()
        p = os.path.join(ROOT, *rel_path.split("/"))
        if os.path.isfile(p):
            for line in open(p, encoding="utf-8"):
                c = [x.strip() for x in line.split("|")]
                if len(c) > 2 and re.match(r'^[A-Z]{1,2}-?\d+$', c[1]):
                    ids.add(c[1])
        return ids

    indexes = {"exercises/INDEX.md": index_rows("exercises/INDEX.md")}
    for d in course_dirs():
        rel_idx = "courses/%s/INDEX.md" % d
        if os.path.isfile(os.path.join(ROOT, "courses", d, "INDEX.md")) or \
           any(e.get("course") == d for e in ex):
            indexes[rel_idx] = index_rows(rel_idx)
    index_ids = set().union(*indexes.values())

    # 0. ids are global: one register, whoever's file a card is written in.
    reg = loaded()
    for r in reg.get("rejected") or []:
        fail.append("%-5s courses/%s/exercises.js: id %s is already in the register "
                    "(ids are unique across js/exercises.js and every course)"
                    % (r.get("id") or "?", r.get("course"), r.get("clash")))
    seen_ids = {}
    for e in ex:
        names = [e.get("id")] + [t.get("alias") for t in (e.get("tabs") or [])
                                 if isinstance(t, dict) and t.get("alias")]
        for n in names:
            where = e.get("course") or "js/exercises.js"
            if n in seen_ids and n == e.get("id"):
                fail.append("%-5s id is registered twice (%s and %s)" % (n, seen_ids[n], where))
            seen_ids.setdefault(n, where)
    # A course's exercises.js registers under its own folder's id only.
    for cdir_id, added in (reg.get("added") or {}).items():
        for tag in added:
            cid, _, owner = tag.partition("@")
            checked += 1
            if owner != cdir_id:
                fail.append("%-5s courses/%s/exercises.js registers it for course %r "
                            "-- a course file adds cards under its own id"
                            % (cid, cdir_id, owner))

    seen_folders = set()
    for e in ex:
        i, folder = e.get("id"), e.get("folder")
        home = home_of(e)
        seen_folders.add((home, folder))
        d = os.path.join(ROOT, *home.split("/"), folder or "")
        readme = os.path.join(d, "README.md")
        if not folder or not os.path.isdir(d):
            fail.append("%-5s folder missing: %s/%s" % (i, home, folder))
            continue
        if not os.path.isfile(readme):
            fail.append("%-5s no README.md in %s/%s" % (i, home, folder))
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
        if i not in indexes.get(index_of(e), set()):
            fail.append("%-5s has no row in %s" % (i, index_of(e)))
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
                "measure", "cv", "pour", "flux", "force", "dye"}
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
    #    Each INDEX against the cards that belong in it, and each exercise
    #    directory (exercises/, courses/<id>/exercises/) against the cards
    #    whose `home` it is.
    for rel_idx, rows in sorted(indexes.items()):
        mine = {e.get("id") for e in ex if index_of(e) == rel_idx}
        for i in sorted(rows - mine):
            elsewhere = [index_of(e) for e in ex if e.get("id") == i]
            fail.append("%-5s row in %s with no card %s" % (
                i, rel_idx, ("there (its card is indexed in %s)" % elsewhere[0]) if elsewhere
                else "in the register"))
    homes = ["exercises"] + ["courses/%s/exercises" % d for d in course_dirs()]
    for home in homes:
        base = os.path.join(ROOT, *home.split("/"))
        if not os.path.isdir(base):
            continue
        for d in sorted(os.listdir(base)):
            p = os.path.join(base, d)
            if os.path.isdir(p) and not d.startswith("_") and (home, d) not in seen_folders:
                fail.append("%-5s %s/%s/ has no card whose folder it is" % ("", home, d))

    # 8. courses: every courses/<id>/course.js (and exercises.js) is loaded by
    # index.html, has a unique id, names hosts as a list of hostnames no other
    # course claims, and lists only exercises (or tabs) the register has.
    if course_dirs():
        html = open(os.path.join(ROOT, "index.html"), encoding="utf-8").read()
        ids_ok = {e.get("id") for e in ex}
        tabs_ok = {(e.get("id"), t.get("key")) for e in ex for t in (e.get("tabs") or [])}
        aliases = {t.get("alias") for e in ex for t in (e.get("tabs") or []) if t.get("alias")}
        for d in course_dirs():
            for name in ("course.js", "exercises.js"):
                if os.path.isfile(os.path.join(ROOT, "courses", d, name)):
                    checked += 1
                    if ('src="courses/%s/%s"' % (d, name)) not in html:
                        fail.append("%-5s courses/%s/%s is not loaded by index.html" % ("", d, name))
        seen, host_owner = set(), {}
        for c in reg.get("courses") or []:
            cid = c.get("id")
            if cid in seen:
                fail.append("course %r is registered twice" % cid)
            seen.add(cid)
            hosts = c.get("hosts")
            if hosts is not None:
                checked += 1
                if not isinstance(hosts, list) or not all(
                        isinstance(h, str) and re.match(r'^[a-z0-9.-]+$', h) for h in hosts):
                    fail.append("course %s: hosts must be a list of lower-case hostnames "
                                "(no scheme, port or path), got %r" % (cid, hosts))
                else:
                    for h in hosts:
                        if h in host_owner and host_owner[h] != cid:
                            fail.append("course %s: host %s is already the default of course %s"
                                        % (cid, h, host_owner[h]))
                        host_owner.setdefault(h, cid)
            for sec in c.get("sections") or []:
                for ref in sec.get("ids") or []:
                    checked += 1
                    base, _, tab = ref.partition("#")
                    if tab and (base, tab) not in tabs_ok:
                        fail.append("course %s lists %s: no such tab" % (cid, ref))
                    elif not tab and base not in ids_ok and base not in aliases:
                        fail.append("course %s lists %s: not in the register" % (cid, ref))
        for cid in sorted({e.get("course") for e in ex if e.get("course")} - seen):
            fail.append("course %s owns cards (courses/%s/exercises.js) but has no "
                        "course.js registering it" % (cid, cid))
        # Every card a course owns is in its own menu. A card left out boots
        # from ?ex= but is in no menu on the course's site -- silent.
        alias_of = {t.get("alias"): e.get("id") for e in ex
                    for t in (e.get("tabs") or []) if t.get("alias")}
        for c in reg.get("courses") or []:
            cid = c.get("id")
            listed = set()
            for sec in c.get("sections") or []:
                for ref in sec.get("ids") or []:
                    base = ref.partition("#")[0]
                    listed.add(alias_of.get(base, base))
            for e in ex:
                if e.get("course") == cid:
                    checked += 1
                    if e.get("id") not in listed:
                        fail.append("%-5s courses/%s/exercises.js owns it but courses/%s/course.js "
                                    "lists it in no section" % (e.get("id"), cid, cid))

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
