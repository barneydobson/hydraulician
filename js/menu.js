// The course menu for THIS deployment — CIVE40008 Fluid Mechanics, Year 1
// (Imperial, Civil Engineering). Fork-local: it never travels upstream. The
// shared code (js/pickers.js) treats this file as optional; another course
// ships its own, or none, and gets the whole register by topic.
//
// Order follows the lectures; the plan behind it is docs/year1-programme.md.
// Ids the register does not have yet are skipped, and a section with nothing
// in it is not shown — so the later sections can be named before they fill.
const EXERCISE_MENU = {
  title: "CIVE40008 · Year 1",
  briefLink: false,          // students read the card; no "Lecturer notes" link
  compact: true,             // one line per exercise; its aim in a box on hover
  collapsible: true,         // headings only; click one to open it
  showAllLink: false,        // no "show all exercises in the register" link
  sections: [
    { title: "Fundamentals",          ids: ["FF-1", "UP-1"] },
    { title: "Statics",               ids: ["HS-1", "PF-2"] },
    { title: "Fluid dynamics",        ids: ["FF-2", "FF-3", "FF-4", "FF-5",
                                            "VC-1", "VC-2",
                                            "MM-1", "MM-2", "HJ-2"] },
    { title: "Energy conservation",   ids: [] },
    { title: "Pipes",                 ids: [] },
    { title: "Free-surface flows",    ids: [] },
    { title: "Showcase",              ids: ["WV-4"] },
  ],
};
