#!/usr/bin/env python3
"""check_pack.py — assert the teaching pack agrees with itself.

Zero dependencies; exits non-zero on any failure, so it can gate a commit.

WHY THIS EXISTS, AND WHY THERE IS NO SINGLE REGISTER INSTEAD
------------------------------------------------------------
The same exercise is described in four places, and they are NOT four copies
of one thing — they are four artifacts with different jobs:

  js/exercises.js            the machine-readable register: what the picker
                             applies (scene, rig, settle, digit rule) and the
                             two lines the card prints. THIS IS THE SOURCE.
  exercises/<f>/README.md    the human brief. Prose a person writes; nothing
                             can generate it.
  exercises/INDEX.md         a navigation table. Its title column is
                             deliberately ABBREVIATED to fit, and its rig
                             column is hand-written prose — not fields.
  exercises/demo-programme.html   a dated planning document (rev 1, 13 Aug),
                             the source the pack was originally built from.
                             History; deliberately not checked here.

Collapsing those into one register is not available: CLAUDE.md keeps the app
dependency-free and classic-script — no modules, no bundlers, no fetch — so
the register has to BE a JS literal the browser can run from file://, not a
JSON file something loads. Generating the docs from it would need a build
step, which this project deliberately does not have.

So the answer to drift is not centralisation, it is this: the handful of
facts that are genuinely DERIVABLE from the register get asserted, and the
prose is left to people. Checked here:

  1. every card's folder exists, and has a README
  2. the README's H1 id and title match the card
  3. every card has a row in INDEX.md (title text NOT compared — see above)
  4. when a README states an "about **N s**" countdown, one of them is the
     card's own `settle`
  5. when a card carries a base/step digit rule and the README prints a
     ten-value ladder, the ladder is what the rule produces
  6. no orphans in either direction

Usage:  python3 exercises/_runner/check_pack.py [-v]
"""
import difflib
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def skeleton(t):
    """Lowercase alphanumerics only — the words, stripped of markup and
    punctuation, so two spellings of one title compare equal."""
    return re.sub(r'[^a-z0-9]', '', re.sub(r'<[^>]+>', '', t).lower())


def ratio(a, b):
    return difflib.SequenceMatcher(None, skeleton(a), skeleton(b)).ratio()


def cards():
    """Parse js/exercises.js — the register — into dicts. Regex rather than a
    JS parser on purpose: the file is hand-written in one house style, and a
    dependency here would defeat the point."""
    src = open(os.path.join(ROOT, "js", "exercises.js"), encoding="utf-8").read()
    starts = [m.start() for m in re.finditer(r'\n\s*id:\s*"[A-Z0-9\-]+"', src)]
    out = []
    for i, a in enumerate(starts):
        b = starts[i + 1] if i + 1 < len(starts) else len(src)
        blk = src[a:b]

        def s(name):
            m = re.search(r'\b%s:\s*"((?:[^"\\]|\\.)*)"' % name, blk)
            return m.group(1) if m else None

        m = re.search(r'\bsettle:\s*(\d+)', blk)
        d = re.search(r'digit:\s*\{.*?base:\s*(-?[\d.]+).*?step:\s*(-?[\d.]+)', blk, re.S)
        out.append({
            "id": s("id"), "title": s("title"), "folder": s("folder"),
            "scene": s("scene"),
            "settle": int(m.group(1)) if m else None,
            "base": float(d.group(1)) if d else None,
            "step": float(d.group(2)) if d else None,
        })
    return out


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
        i, folder = e["id"], e["folder"]
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
            if h1.group(2).strip() != e["title"]:
                fail.append("%-5s title differs\n        card:   %s\n        README: %s"
                            % (i, e["title"], h1.group(2).strip()))

        # 3. INDEX row
        if i not in index_ids:
            fail.append("%-5s has no row in exercises/INDEX.md" % i)
        else:
            checked += 1

        # 4. settle vs the stated countdown
        nums = [int(x) for x in re.findall(r'about\s+\*\*(\d+)\s*s\*\*', txt, re.S)]
        if e["settle"] and nums:
            checked += 1
            if e["settle"] not in nums:
                fail.append("%-5s card settle=%ds but README states %s s"
                            % (i, e["settle"], nums))

        # 5. digit ladder vs base/step (only the horizontal ten-value form)
        if e["base"] is not None:
            row = re.search(r'\|\s*\*\*[^*]*\*\*\s*\|((?:\s*-?[\d.]+\s*\|){10})', txt)
            if row:
                checked += 1
                vals = [round(float(v), 6) for v in row.group(1).split("|") if v.strip()]
                want = [round(e["base"] + e["step"] * k, 6) for k in range(10)]
                if vals != want:
                    fail.append("%-5s digit ladder differs\n        rule:   %s\n        README: %s"
                                % (i, want, vals))

    # 6. orphans
    for i in sorted(index_ids - {e["id"] for e in ex}):
        fail.append("%-5s row in INDEX.md with no card in js/exercises.js" % i)
    for d in sorted(os.listdir(os.path.join(ROOT, "exercises"))):
        p = os.path.join(ROOT, "exercises", d)
        if os.path.isdir(p) and not d.startswith("_") and d not in seen_folders:
            fail.append("%-5s exercises/%s/ has no card in js/exercises.js" % ("", d))

    # The programme doc is rev-1 history and is NOT part of the contract, but
    # a title that has drifted there is still worth seeing: that is the drift
    # that gets noticed on the published site. Warning only, never a failure.
    warn = []
    prog_path = os.path.join(ROOT, "exercises", "demo-programme.html")
    if os.path.isfile(prog_path):
        prog = dict(re.findall(r'<span class="id">([A-Z0-9\-]+)</span><h3>(.*?)</h3>',
                               open(prog_path, encoding="utf-8").read()))
        for e in ex:
            p_title = prog.get(e["id"])
            if p_title is None:
                continue
            # Compare alphanumeric skeletons, not glyphs: the programme writes
            # the same words with HTML sub/sup and different punctuation
            # (q<sup>3/5</sup> for q^(3/5)), and warning on that is noise
            # nobody reads. Only a genuinely different title trips this.
            if skeleton(p_title) and ratio(p_title, e["title"]) < 0.75:
                warn.append("%-5s programme doc: %s" % (e["id"], p_title))

    print("%d exercises, %d assertions" % (len(ex), checked))
    if verbose:
        for e in ex:
            print("  %-5s %-28s %s" % (e["id"], e["scene"], e["title"]))
    if fail:
        print("\n%d PROBLEM%s:" % (len(fail), "" if len(fail) == 1 else "S"))
        for f in fail:
            print("  " + f)
        return 1
    if warn:
        print("\n%d programme-doc title(s) adrift (rev-1 history, not a failure):" % len(warn))
        for w in warn:
            print("  " + w)
    print("pack is self-consistent")
    return 0


if __name__ == "__main__":
    sys.exit(main())
