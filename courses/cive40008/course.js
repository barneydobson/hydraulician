// CIVE40008 Fluid Mechanics, Year 1 (Imperial College London, Civil
// Engineering; lecturer M. van Reeuwijk). Open the app with ?course=cive40008;
// on the lecturer's own Pages site (mvreeuwijk.github.io, the `hosts` below)
// it is the course with no parameter, and ?course=none shows the whole
// register for the visit. The course's own cards are in exercises.js beside
// this file; their briefs are under
// exercises/ here, indexed by INDEX.md.
// Order follows the lectures; the plan behind it is docs/year1-programme.md.
// Ids the register does not have yet are skipped, and a section with nothing
// in it is not shown — so later sections can be named before they fill.
COURSES.add({
  id: "cive40008",
  title: "CIVE40008 · Year 1",
  hosts: ["mvreeuwijk.github.io"],
  sections: [
    { title: "Fundamentals",          ids: ["FF-1", "UP-1"] },
    { title: "Statics",               ids: ["HS-1", "PF-2"] },
    { title: "Fluid dynamics",        ids: ["FF-2", "FF-3", "FF-4", "CR-1",
                                            "VC-2", "MM-1", "HJ-2"] },
    { title: "Energy conservation",   ids: ["HJ-2#energy"] },
    { title: "Pipes",                 ids: [] },
    { title: "Free-surface flows",    ids: [] },
    { title: "Showcase",              ids: ["WV-4", "WV-5"] },
  ],
});
