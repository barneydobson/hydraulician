#!/usr/bin/env python3
"""check_headers.py -- the nine files main.js was split into say what they own.

Each of js/{state,fields,panel,strip,legend,dock,instruments,governor,main}.js
opens with a block comment carrying two lists:

    Defines: the top-level const / let / function names the file declares
    Reads:   every global the file uses that another js/*.js file declares

Classic scripts share one global scope, so the load order and these lists are
the only record of who depends on whom. This gate keeps them honest:

  * every name in `Defines:` is declared at the top level of the file, and
    every top-level declaration is listed;
  * every name in `Reads:` is used in the file (outside comments, strings and
    regex literals, and not as a property or an object key), and every
    cross-file global the file uses is listed.

"Cross-file global" means a top-level const / let / var / function / class in
another js/*.js file, plus EXERCISE_MENU (courses.js defines it with
Object.defineProperty). A local variable or parameter that happens to share a
global's name counts as a use -- the check is lexical, so such a name is simply
listed; rename the local if that reads wrongly.

Usage:  py -3 test/check_headers.py [file ...]
        (no arguments: the nine files)
Exit 1 on any mismatch.
"""
import glob
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NINE = ["state", "fields", "panel", "strip", "legend", "dock",
        "instruments", "governor", "main"]
EXTRA_GLOBALS = {"EXERCISE_MENU"}
IDENT = r"[A-Za-z_$][\w$]*"
REGEX_BEFORE = set("(,=:[!&|?{};+-*%<>~^")
REGEX_KW = ("return", "typeof", "case", "in", "of", "delete", "void", "throw")


def _blank(ch):
    return "\n" if ch == "\n" else " "


def strip_code(s):
    """Blank comments, string and template text and regex literals; keep
    newlines and `${ ... }` expressions so line structure survives."""
    out = []
    i, n = 0, len(s)

    def last_sig():
        j = len(out) - 1
        while j >= 0 and out[j] in " \t\n":
            j -= 1
        return j

    while i < n:
        c = s[i]
        if s.startswith("//", i):
            while i < n and s[i] != "\n":
                out.append(" ")
                i += 1
        elif s.startswith("/*", i):
            j = s.find("*/", i + 2)
            j = n if j < 0 else j + 2
            out.extend(_blank(ch) for ch in s[i:j])
            i = j
        elif c == '"' or c == "'":
            q = c
            out.append(" ")
            i += 1
            while i < n and s[i] != q:
                if s[i] == "\\":
                    out.append(" ")
                    i += 1
                out.append(_blank(s[i]))
                i += 1
            out.append(" ")
            i += 1
        elif c == "`":
            out.append(" ")
            i += 1
            while i < n:
                if s[i] == "\\":
                    out.append(" ")
                    i += 1
                    out.append(_blank(s[i]))
                    i += 1
                elif s[i] == "`":
                    out.append(" ")
                    i += 1
                    break
                elif s.startswith("${", i):
                    out.append("  ")
                    i += 2
                    depth = 1
                    inner = []
                    while i < n:
                        if s[i] == "{":
                            depth += 1
                        elif s[i] == "}":
                            depth -= 1
                            if not depth:
                                break
                        inner.append(s[i])
                        i += 1
                    out.append(strip_code("".join(inner)))
                    out.append(" ")
                    i += 1
                else:
                    out.append(_blank(s[i]))
                    i += 1
        elif c == "/":
            j = last_sig()
            prev = out[j] if j >= 0 else ""
            word = re.search(r"([A-Za-z_$][\w$]*)$", "".join(out[max(0, j - 10):j + 1]))
            is_re = (j < 0 or prev in REGEX_BEFORE or
                     (word is not None and word.group(1) in REGEX_KW))
            if is_re:
                k = i + 1
                incls = False
                while k < n and s[k] != "\n":
                    if s[k] == "\\":
                        k += 2
                        continue
                    if s[k] == "[":
                        incls = True
                    elif s[k] == "]":
                        incls = False
                    elif s[k] == "/" and not incls:
                        break
                    k += 1
                k += 1
                while k < n and re.match(r"[a-z]", s[k]):
                    k += 1
                out.extend(_blank(ch) for ch in s[i:k])
                i = k
            else:
                out.append(c)
                i += 1
        else:
            out.append(c)
            i += 1
    return "".join(out)


def top_level_names(code):
    names = []
    for line in code.split("\n"):
        m = re.match(r"(?:async\s+function\s*\*?|function\s*\*?|class)\s+(" + IDENT + ")", line)
        if m:
            names.append(m.group(1))
            continue
        m = re.match(r"(?:const|let|var)\s+(.*)$", line)
        if not m:
            continue
        depth, cur, parts = 0, "", []
        for ch in m.group(1):
            if ch in "([{":
                depth += 1
            elif ch in ")]}":
                depth -= 1
            if ch == "," and depth == 0:
                parts.append(cur)
                cur = ""
            else:
                cur += ch
        parts.append(cur)
        for p in parts:
            mm = re.match(r"\s*(" + IDENT + r")\s*(?:=|;|$)", p)
            if mm:
                names.append(mm.group(1))
    return names


def read(path):
    with open(path, encoding="utf-8") as f:
        return f.read()


def js_files():
    return sorted(glob.glob(os.path.join(ROOT, "js", "*.js")))


def global_owners(skip):
    """name -> set of js files declaring it, for every file but `skip`."""
    owners = {}
    for p in js_files():
        if os.path.abspath(p) == os.path.abspath(skip):
            continue
        for nm in top_level_names(strip_code(read(p))):
            owners.setdefault(nm, set()).add(os.path.basename(p))
    return owners


def used_names(code, candidates):
    found = set()
    for nm in candidates:
        for m in re.finditer(r"(?<![\w$.])" + re.escape(nm) + r"(?![\w$])", code):
            before = code[:m.start()].rstrip()
            after = code[m.end():].lstrip()
            if after.startswith(":") and not after.startswith("::") and before[-1:] in ("{", ","):
                continue  # an object key
            found.add(nm)
            break
    return found


def header_lists(src):
    m = re.search(r"/\*\*(.*?)\*/", src, re.S)
    if not m:
        return None
    lines = [re.sub(r"^\s*\*\s?", "", ln) for ln in m.group(1).split("\n")]
    got = {}
    key = None
    for ln in lines:
        mm = re.match(r"(Defines|Reads):\s*(.*)$", ln)
        if mm:
            key = mm.group(1)
            got[key] = mm.group(2)
        elif key and ln.strip():
            got[key] += " " + ln.strip()
        else:
            key = None
    out = {}
    for k, v in got.items():
        out[k] = set() if v.strip().lower() == "none" else set(re.findall(IDENT, v))
    return out


def analyse(path):
    """(defined, read) as the code says them -- what a header must list."""
    code = strip_code(read(path))
    defined = top_level_names(code)
    owners = global_owners(path)
    cand = (set(owners) | EXTRA_GLOBALS) - set(defined)
    return defined, sorted(used_names(code, cand), key=str.lower)


def check(path):
    bad = []
    rel = os.path.relpath(path, ROOT).replace(os.sep, "/")
    lists = header_lists(read(path))
    if not lists or "Defines" not in lists or "Reads" not in lists:
        return ["%s: header has no `Defines:` / `Reads:` lists" % rel]
    defined, used = analyse(path)
    d, r = set(defined), set(used)
    for nm in sorted(lists["Defines"] - d):
        bad.append("%s: header Defines %s but the file declares no such top-level name" % (rel, nm))
    for nm in sorted(d - lists["Defines"]):
        bad.append("%s: declares %s at the top level but the header does not list it" % (rel, nm))
    for nm in sorted(lists["Reads"] - r):
        bad.append("%s: header Reads %s but the file never uses it" % (rel, nm))
    for nm in sorted(r - lists["Reads"]):
        bad.append("%s: uses cross-file global %s but the header does not list it" % (rel, nm))
    return bad


def main(argv):
    files = argv or [os.path.join(ROOT, "js", n + ".js") for n in NINE]
    bad = []
    for p in files:
        bad += check(p)
    if bad:
        print("\n".join(bad))
        print("check_headers: %d problem(s)" % len(bad))
        return 1
    print("check_headers: %d file(s), every header matches its file" % len(files))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
