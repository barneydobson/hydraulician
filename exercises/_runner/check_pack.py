#!/usr/bin/env python3
r"""check_pack.py — assert the teaching pack agrees with itself.

Zero dependencies; exits non-zero on any failure, so it can gate a commit.
The same exercise is described in several files ON PURPOSE — the register
(js/exercises.js declares it, empty; every courses/<id>/exercises.js appends
its cards) is the machine-readable source, the rest are prose with different
jobs; AGENTS.md's "pack is described in four places" note has the reasoning.
This asserts the facts that are derivable from the register and the app's own
registers, and leaves the prose to people (a card's folder and INDEX are its
course's: courses/<id>/exercises/<folder>/ and courses/<id>/INDEX.md).

The checks, in the order the code runs them (one function per check):

  0. ids are global: no id registered twice, none refused by COURSES, and a
     course's exercises.js registers cards only under its own course id
  1. every card's folder exists, and has a README
  2. the README's H1 id and title match the card
  3. every card has a row in INDEX.md (title text NOT compared — INDEX
     abbreviates on purpose)
  4. when a README states an "about **N s**" countdown, one of them is the
     card's own `settle`
  5. when a card carries a base/step digit rule and the README prints a
     ten-value ladder, the ladder is what the rule produces
  6. keys: a card (and each of its tabs, and each course.js object) carries
     only keys its schema declares — CARD_KEYS / TAB_KEYS in js/exercises.js,
     COURSE_KEYS in js/courses.js — so a misspelt key fails instead of being
     silently ignored
  7. references: `scene` and `secondScene.scene` are scenes in SCENES, and
     `rig` / `rigTable` resolve to a payload in EXERCISE_RIGS (by the same
     fallbacks EX.rigFor uses)
  8. parameters: every key of `rigParams` / `viewParams` is a Controls row the
     panel can SET (what EX.applyParams drives), and every
     `studentParams[].control` and digit `control` is a Controls row at all
  9. the UI profile: every tool/field/panel id it names actually exists (a
     `build` / `measure` / `view` list is matched against that family of the
     strip, read from TOOLBAR), and BUILD is not hidden from a card whose
     task, start or setup tells the student to draw, cut, erase or otherwise
     build something
 10. TABS (one entry, several questions — CR-1): every tab has a unique key
     and a label, an alias collides with no id, and checks 8, 9 and 12 run on
     each tab's VIEW (the entry with the tab merged over it, as EX.view does
     in js/pickers.js), reported as "CR-1#forces"
 11. the short card layout: `steps` holds at most five, and the inline
     markup in steps / background / setup / tips — {tool:id}, {btn:id},
     {key:K} — names a tool or strip button that exists. A card's (or a
     tab's) own `tips`, the lines that replace its scene's tips at the foot
     of the screen, must be a non-empty list of non-empty strings
 12. a digit rule (or studentParams entry) on a Geometry row -- `geomN` --
     names a param its scene actually declares at index N. The panel binds
     those rows BY INDEX, so a reordered `params` list moves a student's
     slider without a word from the browser; the label the rule lands on is
     printed with -v
 13. no orphans in either direction (INDEX rows without a card, exercise
     folders without a card)
 14. courses: every course.js / exercises.js is loaded by index.html, ids
     are unique across every course, `hosts` are well-formed and claimed
     once, every id a menu lists exists, and every card a course owns is in
     its own menu (a course menu is a hand-written list, so this is the guard)

HOW THIS READS THE APP
----------------------
Every register the checks need — TOOLS, FIELDS, GAUGE_QTY, CONTROLS, TOOLBAR,
UIMODE.HIDE_IDS, OVERLAY.ROW_IDS, SCENES, EXERCISE_RIGS, CARD_KEYS and the cards
themselves — is read by EVALUATING the app: `node` runs every script named by
a `<script src>` tag in index.html, in that order, as classic scripts sharing
one global scope (`vm.runInThisContext` is exactly a browser's script-tag
semantics), against a stub DOM, and prints the registers back as JSON. Nothing
is regexed out of a source file and nothing is copied here, so moving a
register from one js file to another needs no change to this checker. The
real js/courses.js runs, so the `course` / `home` stamps and the
duplicate-id refusals are the app's own, not a re-implementation.

Why not regexes: they were tried, and a card with a NESTED object
(`ui: { readouts: { cursor: false }, build: true }`) cut the naive
`ui:\s*\{([^}]*)\}` capture at the first `}`, so everything after the inner
brace went silently unvalidated. Braces do not nest under a regex; they do
under a parser. Node is not a new dependency (the browser gates need it), so
using it to parse actual JavaScript is what "zero dependencies" was
protecting, not the other way round.

Usage:  python check_pack.py [-v] [--extra <course-file.js>]

`--extra` evaluates one more course file after the real ones (see
fixtures/bad-cards.js). Its cards get every register check but are exempt
from the folder / README / INDEX checks, which they cannot have.
"""
import json
import os
import re
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

_LOADER_JS = r"""
"use strict";
const fs = require("fs"), vm = require("vm"), path = require("path");
const cfg = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
// A DOM stand-in that accepts anything: the scripts only DECLARE at load time
// (boot waits for DOMContentLoaded, which never fires), but a few top-level
// IIFEs touch `document`, `location`, `performance`.
const stub = () => new Proxy(function () {}, {
  get: (t, k) => (k === Symbol.toPrimitive ? () => 0 : k === "length" ? 0 : stub()),
  apply: () => stub(), construct: () => stub(), set: () => true });
const def = (k, v) => Object.defineProperty(global, k, { value: v, configurable: true, writable: true });
def("window", global); def("document", stub()); def("navigator", stub());
def("location", { search: "", hostname: "", href: "" });
def("addEventListener", () => {}); def("performance", { now: () => 0 });
def("localStorage", stub()); def("sessionStorage", stub());
const run = (f) => vm.runInThisContext(fs.readFileSync(f, "utf8"), { filename: f });
const ev = (e) => vm.runInThisContext(e);
const html = fs.readFileSync(path.join(cfg.root, "index.html"), "utf8");
const files = [...html.matchAll(/<script\s+src="([^"]+)"/g)].map((m) => path.join(cfg.root, m[1]));
if (cfg.extra) files.push(cfg.extra);
const rel = (f) => path.relative(cfg.root, f).split(path.sep).join("/");
// Which cards each file appended, so a course file registering cards under
// another course's id is caught. The registry is a Map and COURSES.add can
// be called twice for one id, so every add is recorded too.
const added = {};
global.__adds = [];
let patched = false;
for (const f of files) {
  const before = ev("typeof EXERCISES === 'undefined' ? 0 : EXERCISES.length");
  run(f);
  if (!patched && ev("typeof COURSES !== 'undefined'")) {
    ev("{ const add = COURSES.add; COURSES.add = (c) => { __adds.push(c); add(c); }; }");
    patched = true;
  }
  const now = ev("typeof EXERCISES === 'undefined' ? [] : EXERCISES");
  added[rel(f)] = now.slice(before).map((e) => e.id + "@" + (e.course || ""));
}
const has = (n) => ev("typeof " + n + " !== 'undefined'");
const get = (n) => (has(n) ? ev(n) : null);
process.stdout.write(JSON.stringify({
  exercises: get("EXERCISES"),
  courses: global.__adds,
  rejected: has("COURSES") ? ev("COURSES.rejected") : [],
  added: added,
  extra: cfg.extra ? rel(cfg.extra) : null,
  reg: {
    tools: (get("TOOLS") || []).map((t) => t[0]),
    fields: (get("FIELDS") || []).map((f) => f.id),
    gauge: (get("GAUGE_QTY") || []).map((q) => q.id),
    controls: (get("CONTROLS") || []).filter((c) => c.id).map((c) => ({ id: c.id, set: typeof c.set === "function" })),
    toolbar: (get("TOOLBAR") || []).map((g) => ({ family: g.family,
      items: (g.items || []).map((i) => ({ id: i.id || null, tool: i.tool || null })) })),
    hide: has("UIMODE") ? ev("UIMODE.HIDE_IDS") : null,
    rows: has("OVERLAY") ? ev("OVERLAY.ROW_IDS") : null,
    scenes: has("SCENES") ? ev("SCENES.list").map((s) => ({ id: s.id,
      params: (s.params || []).map((p) => ({ key: p.key, label: p.label })) })) : null,
    rigs: get("EXERCISE_RIGS") ? Object.keys(ev("EXERCISE_RIGS")) : null,
    cardKeys: get("CARD_KEYS"), cardKeysStamped: get("CARD_KEYS_STAMPED"),
    tabKeys: get("TAB_KEYS"), courseKeys: get("COURSE_KEYS"),
  },
}));
"""

_LOADED = None


def loaded():
    """Evaluate the app (see HOW THIS READS THE APP) once; return its JSON."""
    global _LOADED
    if _LOADED is None:
        _LOADED = _load()
    return _LOADED


def cards():
    """The whole register: js/exercises.js's EXERCISES with every course's own
    cards appended, as real Python lists/dicts."""
    return loaded()["exercises"]


def _load():
    extra = None
    if "--extra" in sys.argv:
        extra = os.path.abspath(sys.argv[sys.argv.index("--extra") + 1])
    fd, loader_path = tempfile.mkstemp(suffix=".js")
    fd2, cfg_path = tempfile.mkstemp(suffix=".json")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(_LOADER_JS)
        with os.fdopen(fd2, "w", encoding="utf-8") as f:
            json.dump({"root": ROOT, "extra": extra}, f)
        try:
            # Explicit UTF-8, not `text=True` (which decodes with the
            # console's locale encoding -- cp1252 on Windows, which chokes on
            # the ², ·, ₁ and similar symbols the pack's prose is full of).
            proc = subprocess.run(["node", loader_path, cfg_path],
                                  capture_output=True, timeout=60, encoding="utf-8")
        except FileNotFoundError:
            print("check_pack.py needs `node` on PATH to evaluate the app's scripts "
                  "-- install Node or add it to PATH.")
            sys.exit(1)
        except subprocess.TimeoutExpired:
            print("node timed out evaluating the app's scripts")
            sys.exit(1)
    finally:
        os.unlink(loader_path)
        os.unlink(cfg_path)
    if proc.returncode != 0:
        print("node failed to evaluate the app's scripts (the <script src> list in "
              "index.html) as JavaScript:\n" + proc.stderr)
        sys.exit(1)
    try:
        data = json.loads(proc.stdout)
    except json.JSONDecodeError as exc:
        print("node did not print JSON for the registers (%s)" % exc)
        sys.exit(1)
    if not isinstance(data.get("exercises"), list):
        print("EXERCISES did not evaluate to an array")
        sys.exit(1)
    return data


def course_dirs():
    """courses/<id>/ folders, sorted."""
    cdir = os.path.join(ROOT, "courses")
    if not os.path.isdir(cdir):
        return []
    return [d for d in sorted(os.listdir(cdir))
            if os.path.isdir(os.path.join(cdir, d)) and not d.startswith((".", "_"))]


class Registers:
    """The app's registers, as sets, from the loader's dump. A register that
    came back empty means the app moved something this will not check blind."""

    def __init__(self, reg):
        need = {"tools": "TOOLS", "fields": "FIELDS", "gauge": "GAUGE_QTY",
                "controls": "CONTROLS", "toolbar": "TOOLBAR", "hide": "UIMODE.HIDE_IDS",
                "rows": "OVERLAY.ROW_IDS", "scenes": "SCENES", "rigs": "EXERCISE_RIGS",
                "cardKeys": "CARD_KEYS", "cardKeysStamped": "CARD_KEYS_STAMPED",
                "tabKeys": "TAB_KEYS", "courseKeys": "COURSE_KEYS"}
        for k, name in need.items():
            if not reg.get(k):
                print("check_pack.py cannot find %s after evaluating index.html's scripts -- "
                      "the register moved, was renamed, or is empty, and this check will not "
                      "run blind." % name)
                sys.exit(1)
        self.tools = set(reg["tools"])
        self.fields = set(reg["fields"])
        self.gauge = set(reg["gauge"])
        self.control_ids = {c["id"] for c in reg["controls"]}
        self.settable = {c["id"] for c in reg["controls"] if c["set"]}
        self.hide = set(reg["hide"])
        self.rows = set(reg["rows"])
        self.scenes = {s["id"]: s["params"] for s in reg["scenes"]}
        self.rigs = set(reg["rigs"])
        self.card_keys = set(reg["cardKeys"]) | set(reg["cardKeysStamped"])
        self.tab_keys = set(reg["tabKeys"])
        self.course_keys = set(reg["courseKeys"])
        # The strip's families, from TOOLBAR. UIMODE.allows tests both an
        # item's `tool` and its `id`, and a profile names whichever it has.
        self.family = {}
        self.btn_ids = set()
        for g in reg["toolbar"]:
            names = {i["tool"] or i["id"] for i in g["items"]}
            self.family.setdefault(g["family"], set()).update(names)
            self.btn_ids.update(i["id"] for i in g["items"] if i["id"])
        # BUILD's drawing tools: the build family's items that are tools
        # (Undo and Clear sit beside them but arm nothing).
        self.build_tools = {i["tool"] for g in reg["toolbar"] if g["family"] == "build"
                            for i in g["items"] if i["tool"]}


# ---------------------------------------------------------------- the pack

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


class Ctx:
    """What every check shares: the register, the app's registers, the failure
    list and the assertion counter."""

    def __init__(self):
        self.data = loaded()
        self.ex = self.data["exercises"]
        self.R = Registers(self.data["reg"])
        self.fail = []
        self.checked = 0
        self.unverified = []   # cards whose digit ladder this could not locate
        self.verbose = "-v" in sys.argv
        # Cards that came from --extra: held to every register check, but they
        # have no folder, README or INDEX row to be held to.
        extra = self.data.get("extra")
        self.extra_ids = {t.partition("@")[0]
                          for t in (self.data["added"].get(extra) or [])} if extra else set()

    def bad(self, ref, msg):
        self.fail.append("%-5s %s" % (ref, msg))

    def prose(self):
        """The cards that have files to check (everything but --extra's)."""
        return [e for e in self.ex if e.get("id") not in self.extra_ids]

    # Where each card lives. A course's card (COURSES.exercises stamped
    # `course` and `home`): its folder under courses/<id>/exercises/, its row
    # in courses/<id>/INDEX.md. A card pushed straight into js/exercises.js
    # (no `home`) would be held to exercises/<folder>/ and exercises/INDEX.md.
    @staticmethod
    def home_of(e):
        return e.get("home") or "exercises"

    @staticmethod
    def index_of(e):
        return "courses/%s/INDEX.md" % e["course"] if e.get("course") else "exercises/INDEX.md"

    def indexes(self):
        if not hasattr(self, "_indexes"):
            def rows(rel_path):
                ids = set()
                p = os.path.join(ROOT, *rel_path.split("/"))
                if os.path.isfile(p):
                    for line in open(p, encoding="utf-8"):
                        c = [x.strip() for x in line.split("|")]
                        if len(c) > 2 and re.match(r'^[A-Z]{1,2}-?\d+$', c[1]):
                            ids.add(c[1])
                return ids
            idx = {"exercises/INDEX.md": rows("exercises/INDEX.md")}
            for d in course_dirs():
                rel = "courses/%s/INDEX.md" % d
                if os.path.isfile(os.path.join(ROOT, "courses", d, "INDEX.md")) or \
                   any(e.get("course") == d for e in self.prose()):
                    idx[rel] = rows(rel)
            self._indexes = idx
        return self._indexes

    def readme(self, e):
        """The card's README text, or None when its folder / README is absent
        (check 1 reports that)."""
        folder = e.get("folder")
        p = os.path.join(ROOT, *self.home_of(e).split("/"), folder or "", "README.md")
        return open(p, encoding="utf-8").read() if folder and os.path.isfile(p) else None


# 0. ids are global.
def check_ids(c):
    for r in c.data.get("rejected") or []:
        c.fail.append("%-5s courses/%s/exercises.js: id %s is already in the register "
                      "(ids are unique across js/exercises.js and every course)"
                      % (r.get("id") or "?", r.get("course"), r.get("clash")))
    seen_ids = {}
    for e in c.ex:
        names = [e.get("id")] + [t.get("alias") for t in (e.get("tabs") or [])
                                 if isinstance(t, dict) and t.get("alias")]
        for n in names:
            where = e.get("course") or "js/exercises.js"
            if n in seen_ids and n == e.get("id"):
                c.bad(n, "id is registered twice (%s and %s)" % (seen_ids[n], where))
            seen_ids.setdefault(n, where)
    # A course's exercises.js registers under its own folder's id only.
    for rel, added in (c.data.get("added") or {}).items():
        m = re.match(r"^courses/([^/]+)/exercises\.js$", rel)
        if not m:
            continue
        for tag in added:
            cid, _, owner = tag.partition("@")
            c.checked += 1
            if owner != m.group(1):
                c.bad(cid, "courses/%s/exercises.js registers it for course %r "
                           "-- a course file adds cards under its own id" % (m.group(1), owner))


# 1. folder + README exist.
def check_folders(c):
    for e in c.prose():
        d = os.path.join(ROOT, *c.home_of(e).split("/"), e.get("folder") or "")
        if not e.get("folder") or not os.path.isdir(d):
            c.bad(e.get("id"), "folder missing: %s/%s" % (c.home_of(e), e.get("folder")))
        elif not os.path.isfile(os.path.join(d, "README.md")):
            c.bad(e.get("id"), "no README.md in %s/%s" % (c.home_of(e), e.get("folder")))


# 2. README H1 id + title.
def check_readme_h1(c):
    for e in c.prose():
        txt = c.readme(e)
        if txt is None:
            continue
        i = e.get("id")
        h1 = re.match(r'#\s*([A-Z0-9\-]+)\s*·\s*(.+)', txt.split("\n", 1)[0].strip())
        if not h1:
            c.bad(i, "README H1 is not '# <ID> · <title>'")
            continue
        c.checked += 1
        if h1.group(1) != i:
            c.bad(i, "README H1 says id %s" % h1.group(1))
        if h1.group(2).strip() != e.get("title"):
            c.bad(i, "title differs\n        card:   %s\n        README: %s"
                  % (e.get("title"), h1.group(2).strip()))


# 3. INDEX row.
def check_index_rows(c):
    for e in c.prose():
        if c.readme(e) is None:
            continue
        i = e.get("id")
        if i not in c.indexes().get(c.index_of(e), set()):
            c.bad(i, "has no row in %s" % c.index_of(e))
        else:
            c.checked += 1


# 4. settle vs the stated countdown. `is not None` on purpose: GV-2 carries
# `settle: 0`, which is a real, meaningful value (nothing to wait out) and
# must not be treated the same as "no settle at all". Its README is free to
# print no "about **N s**" line either -- that just means nothing to compare.
def check_settle(c):
    for e in c.prose():
        txt = c.readme(e)
        if txt is None:
            continue
        nums = [int(x) for x in re.findall(r'about\s+\*\*(\d+)\s*s\*\*', txt, re.S)]
        if e.get("settle") is not None and nums:
            c.checked += 1
            if e["settle"] not in nums:
                c.bad(e.get("id"), "card settle=%ds but README states %s s" % (e["settle"], nums))


# 5. digit ladder vs base/step (only the horizontal ten-value form).
def check_digit_ladder(c):
    for e in c.prose():
        txt = c.readme(e)
        digit = e.get("digit") or {}
        base, step = digit.get("base"), digit.get("step")
        if txt is None or base is None:
            continue
        row = re.search(r'\|\s*\*\*[^*]*\*\*\s*\|((?:\s*-?[\d.]+\s*\|){10})', txt)
        if row:
            c.checked += 1
            vals = [round(float(v), 6) for v in row.group(1).split("|") if v.strip()]
            want = [round(float(base) + float(step) * k, 6) for k in range(10)]
            if vals != want:
                c.bad(e.get("id"), "digit ladder differs\n        rule:   %s\n        README: %s"
                      % (want, vals))
        else:
            # A base/step rule but no ladder in the one form this recognises:
            # the rule went UNVERIFIED. Silence reads as "checked and fine",
            # which is the opposite of what happened. Reported, not failed.
            c.unverified.append(e.get("id"))


# 6. keys: only what the schema declares.
def check_keys(c):
    for e in c.ex:
        i = e.get("id")
        c.checked += 1
        bad = sorted(k for k in e if k not in c.R.card_keys)
        if bad:
            c.bad(i, "unknown card key%s: %s (CARD_KEYS in js/exercises.js)"
                  % ("" if len(bad) == 1 else "s", ", ".join(bad)))
        for t in e.get("tabs") or []:
            if isinstance(t, dict):
                bad = sorted(k for k in t if k not in c.R.tab_keys)
                if bad:
                    c.bad("%s#%s" % (i, t.get("key")), "unknown tab key%s: %s (TAB_KEYS in js/exercises.js)"
                          % ("" if len(bad) == 1 else "s", ", ".join(bad)))
    for co in c.data.get("courses") or []:
        c.checked += 1
        bad = sorted(k for k in co if k not in c.R.course_keys)
        if bad:
            c.fail.append("course %s: unknown course key%s: %s (COURSE_KEYS in js/courses.js)"
                          % (co.get("id"), "" if len(bad) == 1 else "s", ", ".join(bad)))


# 7. references: scene, secondScene, rig.
def check_references(c):
    scenes = c.R.scenes
    for e in c.ex:
        i = e.get("id")
        c.checked += 1
        if e.get("scene") not in scenes:
            c.bad(i, "scene %r is not in SCENES (js/scenes.js)" % e.get("scene"))
        s2 = e.get("secondScene")
        if isinstance(s2, dict) and s2.get("scene") is not None:
            c.checked += 1
            if s2["scene"] not in scenes:
                c.bad(i, "secondScene.scene %r is not in SCENES" % s2["scene"])
        # EX.rigFor tries these keys in order and takes the first payload that
        # exists; a rig is unresolved only when none does.
        keys = [e.get("rig")] + list(e.get("rigTable") or [])
        for k in [k for k in keys if k]:
            c.checked += 1
            tries = [k, e.get("id"), str(e.get("id")).replace("-", ""), e.get("folder")]
            if not any(t in c.R.rigs for t in tries):
                c.bad(i, "rig %r has no payload in EXERCISE_RIGS (js/exercises-rigs.js)" % k)


# 8. parameters: what applyParams drives, and the rows a student sets.
def check_params(c):
    R = c.R

    def blocks(e):
        yield e.get("id"), e
        for t in e.get("tabs") or []:
            if isinstance(t, dict):
                yield "%s#%s" % (e.get("id"), t.get("key")), t
    for e in c.ex:
        for ref, b in blocks(e):
            for kind in ("rigParams", "viewParams"):
                p = b.get(kind)
                if p is None:
                    continue
                c.checked += 1
                if not isinstance(p, dict):
                    c.bad(ref, "%s must be an object of control id -> value" % kind)
                    continue
                for k in p:
                    if k not in R.control_ids:
                        c.bad(ref, "%s.%s is not a Controls row (CONTROLS in js/panel.js)" % (kind, k))
                    elif k not in R.settable:
                        c.bad(ref, "%s.%s is a Controls row with no setter, so applyParams "
                                   "would skip it" % (kind, k))
            for r in b.get("studentParams") or []:
                c.checked += 1
                if isinstance(r, dict) and r.get("control") not in R.control_ids:
                    c.bad(ref, "studentParams control %r is not a Controls row" % r.get("control"))
        digit = e.get("digit")
        if isinstance(digit, dict):
            for r in [digit] + list(digit.get("also") or []):
                if isinstance(r, dict) and r.get("control") is not None:
                    c.checked += 1
                    if r["control"] not in R.control_ids:
                        c.bad(e.get("id"), "digit control %r is not a Controls row" % r["control"])


# 9. the UI profile. An exercise may narrow the interface a student meets
#    (see UIMODE in js/legend.js); what it must not do is narrow away a tool
#    its own task asks for, or name something that does not exist.
def check_ui_profile(c):
    R = c.R
    PANEL = {"full", "focused", "shut"}
    # gauges/cursor/status switch a whole panel; `rows` narrows the hover
    # card to named lines and is validated against ROW_IDS.
    READOUT_IDS = {"gauges", "cursor", "status", "rows"}
    for e in views(c.ex):
        i, ui = e.get("_ref"), e.get("ui")
        if ui:
            c.checked += 1
            for fam in ("build", "measure", "view"):
                v = ui.get(fam)
                if isinstance(v, list):
                    known = R.family.get(fam, set())
                    bad = [t for t in v if t not in known]
                    if bad:
                        c.bad(i, "ui.%s names items that are not in the strip's %s family: %s "
                                 "(known: %s)" % (fam, fam.upper(), ", ".join(map(str, bad)),
                                                  ", ".join(sorted(known))))
            fields = ui.get("fields")
            if isinstance(fields, list):
                bad = [f for f in fields if f not in R.fields]
                if bad:
                    c.bad(i, "ui.fields names fields that do not exist: %s" % ", ".join(bad))
            panel = ui.get("panel")
            if panel is not None and panel not in PANEL:
                c.bad(i, "ui.panel is %r, not one of %s" % (panel, sorted(PANEL)))
            controls = ui.get("controls")
            if isinstance(controls, list):
                if not controls:
                    c.bad(i, "ui.controls must not be an empty list")
                bad = [x for x in controls if x not in R.control_ids]
                if bad:
                    c.bad(i, "ui.controls names panel rows that do not exist: %s"
                          % ", ".join(map(str, bad)))
            elif controls is not None and controls is not True:
                c.bad(i, "ui.controls is %r, not true or a list of row ids" % (controls,))
            # What a gauge may plot (GAUGE_QTY), the concepts a card withholds
            # (UIMODE.HIDE_IDS), and per-field descriptions.
            gf = ui.get("gaugeFields")
            if gf is not None:
                c.checked += 1
                if not isinstance(gf, list) or not gf:
                    c.bad(i, "ui.gaugeFields must be a non-empty list")
                else:
                    bad = [q for q in gf if q not in R.gauge]
                    if bad:
                        c.bad(i, "ui.gaugeFields names quantities that do not exist: %s (known: %s)"
                              % (", ".join(map(str, bad)), ", ".join(sorted(R.gauge))))
                    gdef = (e.get("viewParams") or {}).get("gaugeField")
                    if gdef is not None and gdef not in gf:
                        c.bad(i, "viewParams.gaugeField %r is not among ui.gaugeFields" % gdef)
            hide = ui.get("hide")
            if hide is not None:
                c.checked += 1
                bad = [h for h in (hide if isinstance(hide, list) else [hide]) if h not in R.hide]
                if not isinstance(hide, list) or bad:
                    c.bad(i, "ui.hide must list concepts from %s; got %r" % (sorted(R.hide), hide))
            ft = ui.get("fieldText")
            if ft is not None:
                bad = [k for k in (ft if isinstance(ft, dict) else {}) if k not in R.fields]
                if not isinstance(ft, dict) or bad:
                    c.bad(i, "ui.fieldText must map field ids to text; bad: %r" % (bad or ft))
            readouts = ui.get("readouts")
            if isinstance(readouts, dict):
                bad = [k for k in readouts if k not in READOUT_IDS]
                if bad:
                    c.bad(i, "ui.readouts names readouts that do not exist: %s" % ", ".join(bad))
                # `rows` picks which lines the hover card prints, validated
                # against the app's own ROW_IDS (a row that never appears in
                # front of a student is the silent failure).
                rws = readouts.get("rows")
                if rws is not None:
                    c.checked += 1
                    if not isinstance(rws, list) or not rws:
                        c.bad(i, "ui.readouts.rows must be a non-empty list of row ids")
                    else:
                        bad = [r for r in rws if r not in R.rows]
                        if bad:
                            c.bad(i, "ui.readouts.rows names rows that do not exist: %s (known: %s)"
                                  % (", ".join(map(str, bad)), ", ".join(sorted(R.rows))))

        # Gauges a card arrives with already placed (EX.placeCardGauges).
        pg = e.get("gauges")
        if pg is not None:
            c.checked += 1
            ok_pg = isinstance(pg, list) and 0 < len(pg) <= 4 and all(
                isinstance(g, dict) and isinstance(g.get("x"), (int, float))
                and isinstance(g.get("z"), (int, float))
                and (g.get("field") is None or g.get("field") in R.gauge) for g in pg)
            if not ok_pg:
                c.bad(i, "gauges must be 1-4 {x, z, field?} with field from %s" % sorted(R.gauge))

        # The derived profile hides BUILD unless the card declares a build
        # tool or says so outright. A task that tells a student to draw, cut,
        # move or erase something and then takes those tools away is silent in
        # the browser -- the tool is simply not there.
        tools = [t.get("tool") for t in (e.get("instruments") or []) if t.get("tool")]
        declares_build = bool(set(tools) & R.build_tools) or \
                         bool(ui and (ui.get("build") is True or isinstance(ui.get("build"), list)))
        # Count the check when it RUNS, not when it fails.
        if DRAWS.search(draws_text(e)):
            c.checked += 1
            if not declares_build:
                c.bad(i, "task asks the student to draw, but its profile hides "
                         "BUILD -- add `ui: { build: true }` or an instruments entry")


# 10. tabs: the structure first; checks 8, 9 and 12 run on every tab's view.
def check_tabs(c):
    all_ids = {e.get("id") for e in c.ex}
    aliases = set()
    for e in c.ex:
        tabs = e.get("tabs")
        if tabs is None:
            continue
        c.checked += 1
        i = e.get("id")
        if not isinstance(tabs, list) or not tabs:
            c.bad(i, "tabs must be a non-empty list")
            continue
        keys = [t.get("key") for t in tabs if isinstance(t, dict)]
        if len(keys) != len(tabs) or not all(isinstance(k, str) and k for k in keys):
            c.bad(i, "every tab needs a string `key`")
        if len(set(keys)) != len(keys):
            c.bad(i, "tab keys repeat: %s" % keys)
        for t in tabs:
            if not isinstance(t, dict) or not t.get("label"):
                c.bad(i, "tab %r has no label" % (t.get("key") if isinstance(t, dict) else t))
            a = isinstance(t, dict) and t.get("alias")
            if a:
                if a in all_ids or a in aliases:
                    c.bad(i, "tab alias %r collides with another id or alias" % a)
                aliases.add(a)
    index_ids = set().union(*c.indexes().values())
    if aliases & index_ids:
        c.fail.append("      INDEX.md has rows for tab aliases (they are not cards): %s"
                      % ", ".join(sorted(aliases & index_ids)))


# 11. the short layout, and the inline markup it uses.
def check_layout(c):
    for v in views(c.ex):
        i = v["_ref"]
        steps = v.get("steps")
        if steps is not None:
            c.checked += 1
            if not isinstance(steps, list) or not steps:
                c.bad(i, "steps must be a non-empty list")
            elif len(steps) > 5:
                c.bad(i, "has %d steps; the short layout holds at most 5 -- move the rest "
                         "into `background`" % len(steps))
        tips = v.get("tips")
        if tips is not None:
            c.checked += 1
            if (not isinstance(tips, list) or not tips
                    or not all(isinstance(t, str) and t.strip() for t in tips)):
                c.bad(i, "tips must be a non-empty list of non-empty strings")
                tips = []
        texts = ((v.get("steps") or []) + paras(v.get("background")) + (v.get("setup") or [])
                 + (tips or []))
        for txt in texts:
            for kind, ident in MARK.findall(str(txt)):
                c.checked += 1
                if kind == "tool" and ident not in c.R.tools:
                    c.bad(i, "{tool:%s} names no tool" % ident)
                if kind == "btn" and ident not in c.R.btn_ids:
                    c.bad(i, "{btn:%s} names no strip button" % ident)


# 12. Geometry rows bind by index. A rule on geomN with a scene that declares
#     N params or fewer is a slider that is not there; one on a scene that
#     declares more may be the wrong one -- both silent in the browser.
def check_geometry_rows(c):
    rules = [(e, r) for e in views(c.ex)
             for r in ([e.get("digit")] if e.get("digit") else []) +
                      (e.get("digit") or {}).get("also", []) +
                      (e.get("studentParams") or [])
             if r and re.match(r"^geom\d$", str(r.get("control") or ""))]
    for e, r in rules:
        if e.get("scene") not in c.R.scenes:
            continue   # check 7 names the unknown scene
        c.checked += 1
        n = int(r["control"][4:])
        decl = c.R.scenes[e.get("scene")]
        if n >= len(decl):
            c.bad(e.get("_ref"), "%s is on Geometry row %d but scene %r declares only %d param%s"
                  % (r["control"], n, e.get("scene"), len(decl), "" if len(decl) == 1 else "s"))
        elif c.verbose:
            print("  %-5s %s -> %s (%s)" % (e.get("_ref"), r["control"], decl[n]["key"], decl[n]["label"]))


# 13. orphans: each INDEX against the cards that belong in it, and each
#     exercise directory against the cards whose `home` it is.
def check_orphans(c):
    prose = c.prose()
    for rel_idx, rows in sorted(c.indexes().items()):
        mine = {e.get("id") for e in prose if c.index_of(e) == rel_idx}
        for i in sorted(rows - mine):
            elsewhere = [c.index_of(e) for e in prose if e.get("id") == i]
            c.bad(i, "row in %s with no card %s" % (
                rel_idx, ("there (its card is indexed in %s)" % elsewhere[0]) if elsewhere
                else "in the register"))
    seen_folders = {(c.home_of(e), e.get("folder")) for e in prose}
    for home in ["exercises"] + ["courses/%s/exercises" % d for d in course_dirs()]:
        base = os.path.join(ROOT, *home.split("/"))
        if not os.path.isdir(base):
            continue
        for d in sorted(os.listdir(base)):
            p = os.path.join(base, d)
            if os.path.isdir(p) and not d.startswith("_") and (home, d) not in seen_folders:
                c.bad("", "%s/%s/ has no card whose folder it is" % (home, d))


# 14. courses: every courses/<id>/course.js (and exercises.js) is loaded by
# index.html, has a unique id, names hosts as a list of hostnames no other
# course claims, and lists only exercises (or tabs) the register has.
def check_courses(c):
    ex = c.ex
    if not course_dirs():
        return
    html = open(os.path.join(ROOT, "index.html"), encoding="utf-8").read()
    ids_ok = {e.get("id") for e in ex}
    tabs_ok = {(e.get("id"), t.get("key")) for e in ex for t in (e.get("tabs") or [])}
    aliases = {t.get("alias") for e in ex for t in (e.get("tabs") or []) if t.get("alias")}
    for d in course_dirs():
        for name in ("course.js", "exercises.js"):
            if os.path.isfile(os.path.join(ROOT, "courses", d, name)):
                c.checked += 1
                if ('src="courses/%s/%s"' % (d, name)) not in html:
                    c.bad("", "courses/%s/%s is not loaded by index.html" % (d, name))
    seen, host_owner = set(), {}
    for co in c.data.get("courses") or []:
        cid = co.get("id")
        if cid in seen:
            c.fail.append("course %r is registered twice" % cid)
        seen.add(cid)
        hosts = co.get("hosts")
        if hosts is not None:
            c.checked += 1
            if not isinstance(hosts, list) or not all(
                    isinstance(h, str) and re.match(r'^[a-z0-9.-]+$', h) for h in hosts):
                c.fail.append("course %s: hosts must be a list of lower-case hostnames "
                              "(no scheme, port or path), got %r" % (cid, hosts))
            else:
                for h in hosts:
                    if h in host_owner and host_owner[h] != cid:
                        c.fail.append("course %s: host %s is already the default of course %s"
                                      % (cid, h, host_owner[h]))
                    host_owner.setdefault(h, cid)
        for sec in co.get("sections") or []:
            for ref in sec.get("ids") or []:
                c.checked += 1
                base, _, tab = ref.partition("#")
                if tab and (base, tab) not in tabs_ok:
                    c.fail.append("course %s lists %s: no such tab" % (cid, ref))
                elif not tab and base not in ids_ok and base not in aliases:
                    c.fail.append("course %s lists %s: not in the register" % (cid, ref))
    extra_course = {e.get("course") for e in ex if e.get("id") in c.extra_ids}
    for cid in sorted({e.get("course") for e in c.prose() if e.get("course")} - seen - extra_course):
        c.fail.append("course %s owns cards (courses/%s/exercises.js) but has no "
                      "course.js registering it" % (cid, cid))
    # Every card a course owns is in its own menu. A card left out boots from
    # ?ex= but is in no menu on the course's site -- silent.
    alias_of = {t.get("alias"): e.get("id") for e in ex
                for t in (e.get("tabs") or []) if t.get("alias")}
    for co in c.data.get("courses") or []:
        cid = co.get("id")
        listed = set()
        for sec in co.get("sections") or []:
            for ref in sec.get("ids") or []:
                base = ref.partition("#")[0]
                listed.add(alias_of.get(base, base))
        for e in c.prose():
            if e.get("course") == cid:
                c.checked += 1
                if e.get("id") not in listed:
                    c.bad(e.get("id"), "courses/%s/exercises.js owns it but courses/%s/course.js "
                                       "lists it in no section" % (cid, cid))


# Card constants that used to be asserted in a browser (test/ui-smoke.mjs):
# the page holds no more information than the register does, so they are pack
# checks. QS-2's brief must stand alone, and its student-number rules (the
# two reservoir widths) are exactly 6.75 + 0.25 d and 3.75 + 0.25 d.
def check_card_constants(c):
    card = next((e for e in c.ex if e.get("id") == "QS-2"), None)
    if card is None:
        c.bad("QS-2", "card not found in the register")
        return
    c.checked += 1
    text = " ".join(str(x) for x in [card.get("start"), card.get("task")] + list(card.get("setup") or []))
    if re.search(r"readme|see the brief", text, re.I):
        c.bad("QS-2", "student instructions point at the README / brief instead of standing alone")
    c.checked += 1
    digit = card.get("digit") or {}
    also = digit.get("also") or [{}]
    if not (digit.get("base") == 6.75 and digit.get("step") == 0.25 and also[0].get("base") == 3.75):
        c.bad("QS-2", "digit rule is not B1 = 6.75 + 0.25 d, B2 = 3.75 + 0.25 d (got %a)" % (digit,))


CHECKS = [check_ids, check_folders, check_readme_h1, check_index_rows, check_settle,
          check_digit_ladder, check_keys, check_references, check_params, check_ui_profile,
          check_tabs, check_layout, check_geometry_rows, check_orphans, check_courses,
          check_card_constants]


def check_retirement_refs(c):
    """PRINTS, never fails: every reference outside courses/original/ to an
    original-pack card id -- the generated checklist for retiring that pack
    (see docs/making-exercises.md, "Retiring the original pack")."""
    ids = sorted({e["id"] for e in c.ex if e.get("course") == "original"})
    if not ids:
        return
    pat = re.compile(r"(?<![\w-])(" + "|".join(re.escape(i) for i in ids) + r")(?![\w-])")
    try:
        files = subprocess.run(["git", "ls-files"], cwd=ROOT, capture_output=True,
                               encoding="utf-8").stdout.splitlines()
    except FileNotFoundError:
        return
    text = (".md", ".js", ".mjs", ".py", ".html", ".yml", ".json", ".css")
    rows = []
    for rel in files:
        if (rel.startswith(("courses/original/", "docs/_archive/", "docs/superpowers/",
                           "exercises/_code-changes/", ".superpowers/"))
                or not rel.endswith(text)):
            continue
        try:
            with open(os.path.join(ROOT, rel), encoding="utf-8") as f:
                found = sorted(set(pat.findall(f.read())))
        except (OSError, UnicodeDecodeError):
            continue
        if found:
            rows.append("  %s: %s" % (rel, " ".join(found)))
    print("retirement checklist: %d file%s outside courses/original/ mention an original-pack id"
          % (len(rows), "" if len(rows) == 1 else "s"))
    for r in rows:
        print(r)


def main():
    c = Ctx()
    if not c.ex:
        print("could not parse any exercise from the register")
        return 1
    for check in CHECKS:
        check(c)
    if c.unverified:
        print("note: no digit ladder found in the recognised table form, so "
              "the base/step rule is UNVERIFIED for: " + ", ".join(c.unverified))
    check_retirement_refs(c)
    print("%d exercises, %d assertions" % (len(c.ex), c.checked))
    if c.verbose:
        for e in c.ex:
            print("  %-5s %-28s %s" % (e.get("id"), e.get("scene"), e.get("title")))
    if c.fail:
        print("\n%d PROBLEM%s:" % (len(c.fail), "" if len(c.fail) == 1 else "S"))
        for f in c.fail:
            print("  " + f)
        return 1
    print("pack is self-consistent")
    return 0


if __name__ == "__main__":
    sys.exit(main())
