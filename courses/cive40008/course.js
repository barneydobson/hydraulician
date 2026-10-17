// CIVE40008 Fluid Mechanics, Year 1 (Imperial College London, Civil
// Engineering; lecturer M. van Reeuwijk). Open the app with ?course=cive40008.
// Order follows the lectures; the plan behind it is docs/year1-programme.md.
// Ids the register does not have yet are skipped, and a section with nothing
// in it is not shown — so later sections can be named before they fill.
COURSES.add({
  id: "cive40008",
  title: "CIVE40008 · Year 1",
  sections: [
    { title: "Fundamentals",          ids: ["FF-1", "UP-1"] },
    { title: "Statics",               ids: ["HS-1", "PF-2"] },
    { title: "Fluid dynamics",        ids: ["FF-2", "FF-3", "FF-4",
                                            "CR-1#streamlines", "CR-1#continuity", "VC-2",
                                            "MM-1", "CR-1#forces", "HJ-2"] },
    { title: "Energy conservation",   ids: [] },
    { title: "Pipes",                 ids: [] },
    { title: "Free-surface flows",    ids: [] },
    { title: "Showcase",              ids: ["WV-4"] },
  ],
});
