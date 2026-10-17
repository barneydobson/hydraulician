// COURSES — the course menus this build knows, and which one is active.
//
// A course is one module someone teaches with the app: a title and the
// exercises its students see, in sections. Each lives in its own folder,
// courses/<id>/course.js, which calls COURSES.add({...}); index.html loads
// every course file with one <script> tag each (classic scripts, so this
// works from file:// with no server). Nothing here knows a course id.
//
// Which course is active: `?course=<id>` in the URL. It is remembered for the
// rest of the visit (sessionStorage), so links inside the app that drop the
// parameter keep the course; `?course=` with no value (or `none`) clears it.
// With no course, the exercise menu lists the whole register by topic.
//
// The active course is exposed as the global EXERCISE_MENU, which is what
// js/pickers.js reads (`{ title, sections: [{ title, ids }], ...switches }`).
const COURSES = (() => {
  const all = new Map();
  const KEY = "hydraulician.course";
  function fromUrl() {
    const m = /[?&]course=([^&#]*)/.exec(location.search);
    return m ? decodeURIComponent(m[1]) : undefined;
  }
  let chosen;
  function store(v) { try { v ? sessionStorage.setItem(KEY, v) : sessionStorage.removeItem(KEY); } catch (_) { /* private mode */ } }
  function stored() { try { return sessionStorage.getItem(KEY) || ""; } catch (_) { return ""; } }
  function resolve() {
    if (chosen !== undefined) return chosen;
    const u = fromUrl();
    if (u !== undefined) { chosen = (u === "none") ? "" : u; store(chosen); }
    else chosen = stored();
    return chosen;
  }
  return {
    /** Register a course: { id, title, sections: [{ title, ids: [...] }], ...switches }. */
    add(c) {
      if (!c || !c.id || !Array.isArray(c.sections)) { console.warn("COURSES.add: needs id and sections", c); return; }
      all.set(c.id, c);
    },
    get: (id) => all.get(id) || null,
    list: () => [...all.values()],
    /** The active course, or null (whole register). An unknown id is ignored. */
    active() { const id = resolve(); return (id && all.get(id)) || null; },
    /** Switch course for this visit (null/"" = none). */
    choose(id) { chosen = id || ""; store(chosen); },
  };
})();
// What the exercise menu reads. A getter, so courses registered after this
// file (and a later COURSES.choose) are seen without any ordering dance.
Object.defineProperty(window, "EXERCISE_MENU", { get: () => COURSES.active(), configurable: true });
