// The original teaching pack — the cards that were the whole
// register before courses existed. The lecturer means to retire them in time
// ("they're not very good and eventually we'll delete them"), so they live as
// one course folder — but retiring it is a checklist, not one deletion
// (docs/making-exercises.md, "Retiring the original pack"; check_pack.py prints
// every outside reference). The folder holds: this file, exercises.js
// beside it (the cards), exercises/ (the briefs), INDEX.md, and the pack's
// history documents (demo-programme.html, feasibility-sheet.html,
// CHANGES-NEEDED.md, _director-status.md, _worker-recipe.md).
//
// On the main site (barneydobson.github.io, the `hosts` below) this is the
// course with no parameter, so it opens exactly as the register-by-topic menu
// did before the move. Elsewhere: ?course=original; ?course=none shows the
// whole register (every course's cards) for the visit.
//
// The sections are the cards' `topic`s in the order they first appear in
// exercises.js — the grouping the menu draws with no course — so a card added
// to exercises.js needs a line here as well (check_pack.py checks every id
// listed here exists; it does not check that every card is listed).
//
// `briefLink: true` keeps each card's "Lecturer notes" link to its brief, as
// the cards had before the course menus (the switch defaults to off, for
// student-facing courses); these cards are lecturer demos and point at it.
COURSES.add({
  id: "original",
  title: "Hydraulics teaching pack",
  hosts: ["barneydobson.github.io"],
  briefLink: true,
  sections: [
    { title: "Uniform flow",          ids: ["UF-1"] },
    { title: "Gradually varied flow", ids: ["GV-1", "GV-2"] },
    { title: "Hydraulic jump",        ids: ["HJ-1"] },
    { title: "Natural channels",      ids: ["NC-2", "NC-3"] },
    { title: "Specific energy",       ids: ["FB-1", "FB-2"] },
    { title: "Weirs & controls",      ids: ["WE-1"] },
    { title: "Momentum",              ids: ["MO-1", "MO-2"] },
    { title: "Pipe flow & losses",    ids: ["FR-1", "LL-1", "LL-2", "B10"] },
    { title: "Pumps & systems",       ids: ["PU-1"] },
    { title: "Hydropower",            ids: ["HP-1", "HP-2", "HP-3"] },
    { title: "Water hammer",          ids: ["UN-1", "UN-2", "UN-3", "B1", "B2"] },
    { title: "Unsteady flow",         ids: ["B3"] },
    { title: "Quasi-steady flow",     ids: ["QS-1", "QS-2"] },
    { title: "Metering",              ids: ["B7"] },
    { title: "Orifices & jets",       ids: ["B8"] },
    { title: "Pipe networks",         ids: ["B9"] },
    { title: "Urban drainage",        ids: ["CS-1"] },
    { title: "Waves",                 ids: ["WV-1", "WV-2", "WV-3", "B4", "B5", "B6"] },
    { title: "Similitude",            ids: ["DA-1", "DA-3"] },
    { title: "Hydrostatics",          ids: ["HS-1"] },
  ],
});
