#!/usr/bin/env python3
"""check_docs.py -- the prose that tells a contributor what exists stays true.

Zero dependencies; exits non-zero on any failure, so it can gate a commit.
AGENTS.md is the brief every contributor (human or agent) reads first, and
docs/testing.md is the manual behind its gate table. Both name files and
commands, and both rotted before: a table row for a file that had moved, a
`smoke.js --only=...` for a suite that no longer exists, an assertion count
that was wrong within a week. This gate asserts:

  1. every path written in backticks in AGENTS.md, docs/testing.md, README.md
     and docs/making-exercises.md exists. A token counts as a path when it has
     no spaces and either contains a `/` or ends in a file extension the repo
     uses. Globs, placeholders (`<id>`, `*`, `{`), URLs, query strings and
     `plots/` output, a Jekyll page (`x.html` for an existing `x.md`) and
     any `_archive/` folder (unpublished or untracked by design) and any path .gitignore names
     (`.claude/worktrees/`) are ignored; a bare `name/` is a folder of that
     name anywhere in the tree. A token with a `/`
     resolves from the repo root (or from the document's own folder); a bare
     file name resolves if a file of that name exists anywhere in the tree.
  2. every `smoke.mjs ... --only=X,Y` names suites that test/smoke.mjs
     defines (read from its `SUITES.<name> =` lines), and docs/testing.md
     mentions every one of those suites.
  3. AGENTS.md carries no `<n> assertions` claim -- counts drift every week;
     the gate table says what a gate guards, not how many lines it has.

Usage:  python3 test/check_docs.py      (Windows: py -3 test/check_docs.py)
"""
import os
import re
import sys

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(errors="replace")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EXTS = (".js", ".mjs", ".py", ".md", ".html", ".css", ".yml", ".json", ".svg", ".png")
SKIP_DIRS = {".git", "node_modules", "__pycache__"}

failures = []




def fail(msg):
    failures.append(msg)


def read(rel):
    with open(os.path.join(ROOT, rel), encoding="utf-8") as fh:
        return fh.read()


def _ignored():
    out = set()
    try:
        for line in read(".gitignore").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "*" not in line:
                out.add(line.strip("/"))
    except OSError:
        pass
    return out


IGNORED = _ignored()


_basenames = None
_dirnames = set()


def basename_exists(name):
    global _basenames
    if _basenames is None:
        _basenames = set()
        _dirnames.clear()
        for dp, dns, fns in os.walk(ROOT):
            rel = os.path.relpath(dp, ROOT).replace(os.sep, "/")
            if rel.startswith(".claude/worktrees"):
                dns[:] = []
                continue
            dns[:] = [d for d in dns if d not in SKIP_DIRS]
            _basenames.update(fns)
            _dirnames.update(dns)
    return name in _basenames


def looks_like_path(tok):
    if re.search(r"[\s<>*{}()=?|$,;:]", tok) or "://" in tok:
        return False
    if not tok.isascii() or tok.startswith("/"):
        return False                      # `p/rho g` in Greek, `/proc`, `.../courses/...`
    if tok.startswith("plots/"):
        return False                      # collect_plot.py's output, not a tracked file
    if tok.startswith(("-", "~", ".", "#")) and not tok.startswith(".github/") \
            and not tok.startswith(".claude/"):
        return False
    return "/" in tok or tok.endswith(EXTS)


def check_paths(doc):
    text = read(doc)
    docdir = os.path.dirname(doc)
    for ln, line in enumerate(text.split("\n"), 1):
        for tok in re.findall(r"`([^`\n]+)`", line):
            if not looks_like_path(tok):
                continue
            parts = tok.rstrip("/").split("/")
            if "_archive" in parts:
                continue
            if tok.startswith("docs/_archive"):
                continue
            if tok.rstrip("/") in IGNORED:
                continue                  # a path .gitignore names: absent by design
            if "/" in tok and not tok.endswith(EXTS) and not tok.endswith("/")                     and not os.path.exists(os.path.join(ROOT, parts[0])):
                continue                  # `source.z/.vz`, `4L/c`: prose, not a path
            if tok.endswith(".html") and os.path.exists(
                    os.path.join(ROOT, tok[:-5] + ".md")):
                continue                  # a page Jekyll renders from the .md
            if tok.endswith("/") and len(parts) == 1:
                basename_exists("")       # fill the name caches
                ok = parts[0] in _dirnames or os.path.exists(os.path.join(ROOT, parts[0]))
            elif "/" in tok:
                cands = [os.path.join(ROOT, tok), os.path.join(ROOT, docdir, tok)]
                ok = any(os.path.exists(c) for c in cands)
            else:
                ok = basename_exists(tok)
            if not ok:
                fail("%s:%d: `%s` does not exist" % (doc, ln, tok))


def suites():
    src = read("test/smoke.mjs")
    return re.findall(r"^SUITES\.(\w+)\s*=", src, re.M)


def check_suites(doc, known):
    for ln, line in enumerate(read(doc).split("\n"), 1):
        for cmd, only in re.findall(r"(\S*smoke\S*)[^`|\n]*?--only=([^\s`|]+)", line):
            if "ui-smoke" in cmd:
                continue
            for name in only.split(","):
                if "<" in name or "." in name:
                    continue              # a placeholder: --only=<suite,...>
                if name not in known:
                    fail("%s:%d: --only=%s: no such suite (have: %s)"
                         % (doc, ln, name, ", ".join(known)))


def main():
    known = suites()
    if not known:
        fail("test/smoke.mjs: found no `SUITES.<name> =` lines")
    for doc in ("AGENTS.md", "docs/testing.md", "README.md", "docs/making-exercises.md"):
        if not os.path.exists(os.path.join(ROOT, doc)):
            fail("%s: missing" % doc)
            continue
        check_paths(doc)
        check_suites(doc, known)

    if os.path.exists(os.path.join(ROOT, "docs/testing.md")):
        testing = read("docs/testing.md")
        for name in known:
            if not re.search(r"\b%s\b" % re.escape(name), testing):
                fail("docs/testing.md: suite `%s` is never mentioned" % name)

    for ln, line in enumerate(read("AGENTS.md").split("\n"), 1):
        if re.search(r"\b\d+\s+assertions?\b", line):
            fail("AGENTS.md:%d: an assertion count (they drift): %s" % (ln, line.strip()))

    if failures:
        print("check_docs: %d problem(s)" % len(failures))
        for f in failures:
            print("  " + f)
        return 1
    print("check_docs: ok (AGENTS.md, docs/testing.md, README.md, docs/making-exercises.md; %d suites)"
          % len(known))
    return 0


if __name__ == "__main__":
    sys.exit(main())
