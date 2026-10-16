// The course menu for THIS deployment — CIVE40008 Fluid Mechanics, Year 1
// (Imperial, Civil Engineering). Fork-local: it never travels upstream. The
// shared code (js/pickers.js) treats this file as optional; another course
// ships its own, or none, and gets the whole register by topic.
//
// Order follows the lectures; the plan behind it is docs/year1-programme.md.
// Ids the register does not have yet are skipped, not errors.
const EXERCISE_MENU = {
  title: "CIVE40008 · Year 1",
  sections: [
    { title: "L2 · Fundamentals",       ids: ["FF-1", "UP-1"] },
    { title: "L3 · Statics",            ids: ["HS-1", "PF-2"] },
    { title: "L4 · Fluid motion",       ids: ["FF-2", "FF-3", "FF-4", "FF-5"] },
    { title: "L5 · Mass conservation",  ids: ["VC-1", "VC-2"] },
    { title: "L6 · Momentum",           ids: ["MM-1", "MM-2", "HJ-2"] },
    { title: "Year 2 preview",          ids: ["WV-4"] },
  ],
};
