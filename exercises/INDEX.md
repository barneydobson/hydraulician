# Exercises — where they are

Every exercise belongs to a course, and each course indexes its own: the
cards in `courses/<id>/exercises.js`, one brief folder each under
`courses/<id>/exercises/<ID>-<slug>/`, and the table of them in
`courses/<id>/INDEX.md`. They are still one register — `?ex=<ID>` and
`?menu=all` reach every card from any course, and ids are unique across all
of them.

| Course | `?course=` | Default on | Index |
| --- | --- | --- | --- |
| Hydraulics teaching pack — the original cards, due to be retired | `original` | barneydobson.github.io | [courses/original/INDEX.md](../courses/original/INDEX.md) |
| CIVE40008 · Year 1 (Imperial College London) | `cive40008` | mvreeuwijk.github.io | [courses/cive40008/INDEX.md](../courses/cive40008/INDEX.md) |

What is left in this folder is shared tooling, not exercises:

- `_runner/` — `check_pack.py` (the pack agrees with itself, every course
  included) and the Linux CDP `runner.py` (see its HOWTO.md).
- `_code-changes/` — reports and screenshots from the app changes made while
  the original pack was built (picker, gauges, rig sharing, card fixes).

Both are underscore folders, so the Pages build does not publish them. How a
demo becomes a card, and how a course gets its own, is
[docs/making-exercises.md](../docs/making-exercises.md).
