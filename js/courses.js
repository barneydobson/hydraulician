/**
 * courses.js — dependency record (checked by exercises/_runner/check_headers.py).
 *
 * Defines: COURSES, COURSE_KEYS
 *
 * Reads:   EXERCISES
 */
// COURSES — the course menus this build knows, and which one is active.
//
// A course is one module someone teaches with the app: a title and the
// exercises its students see, in sections. Each lives in its own folder,
// courses/<id>/, loaded by index.html with one <script> tag per file
// (classic scripts, so this works from file:// with no server):
//
//   courses/<id>/course.js      COURSES.add({ id, title, sections, hosts? })
//   courses/<id>/exercises.js   COURSES.exercises(id, [ ...cards ])  — optional
//   courses/<id>/exercises/<ID>-<slug>/   the lecturer brief (README.md),
//                                rig.js, thumbnails — one folder per card
//   courses/<id>/INDEX.md       one row per card the course owns
//
// Nothing here knows a course id.
//
// COURSE-OWNED EXERCISES. A course may keep its own cards instead of adding
// them to the shared register (js/exercises.js). COURSES.exercises(id, list)
// stamps each card with `course: id` and `home: "courses/<id>/exercises"`
// (the folder its `folder` sits in) and appends it to the one EXERCISES list,
// so `?ex=<ID>`, `?menu=all`, the picker and the brief link treat it exactly
// like a shared card. Ids are global: a card whose id (or tab alias) is
// already in the register is refused with a console warning, recorded in
// COURSES.rejected, and check_pack.py fails the pack over it.
//
// Which course is active, first match wins:
//   1. `?course=<id>` in the URL — remembered for the rest of the visit
//      (sessionStorage), so links inside the app that drop the parameter keep
//      the course; `?course=none` (or `?course=` with no value) clears it for
//      the visit, and that too is remembered.
//   2. what the visit remembered from 1.
//   3. the course whose `hosts` lists the page's hostname — so a deployment
//      (e.g. a lecturer's own GitHub Pages site) opens on its course with no
//      parameter at all. On file:// the hostname is empty and nothing matches.
// With no course, the exercise menu lists the whole register by topic.
//
// The active course is exposed as the global EXERCISE_MENU, which is what
// js/pickers.js reads (`{ title, sections: [{ title, ids }], ...switches }`).
const COURSES = (() => {
  const all = new Map();
  const rejected = [];
  const KEY = "hydraulician.course";
  const NONE = "none";
  function fromUrl() {
    const m = /[?&]course=([^&#]*)/.exec(location.search);
    return m ? decodeURIComponent(m[1]) : undefined;
  }
  let chosen;                  // undefined = nothing explicit; "" = explicitly none
  function store(v) { try { sessionStorage.setItem(KEY, v || NONE); } catch (_) { /* private mode */ } }
  function stored() { try { return sessionStorage.getItem(KEY); } catch (_) { return null; } }
  function byHost() {
    const h = String(location.hostname || "").toLowerCase();
    if (!h) return "";
    for (const c of all.values()) {
      if (Array.isArray(c.hosts) && c.hosts.some((x) => String(x).toLowerCase() === h)) return c.id;
    }
    return "";
  }
  function resolve() {
    if (chosen === undefined) {
      const u = fromUrl();
      if (u !== undefined) { chosen = (u === NONE) ? "" : u; store(chosen); }
      else {
        const s = stored();
        if (s !== null && s !== "") chosen = (s === NONE) ? "" : s;
      }
    }
    // The host default is looked up each time rather than cached: it depends
    // on which courses have registered, and costs a loop over a handful.
    return chosen !== undefined ? chosen : byHost();
  }
  function register() {
    return (typeof EXERCISES !== "undefined" && Array.isArray(EXERCISES)) ? EXERCISES : null;
  }
  return {
    /** Register a course: { id, title, sections: [{ title, ids: [...] }],
     *  hosts?: ["host.name"], ...switches }. */
    add(c) {
      if (!c || !c.id || !Array.isArray(c.sections)) { console.warn("COURSES.add: needs id and sections", c); return; }
      all.set(c.id, c);
    },
    /** Add a course's own cards to the shared register (see the header). */
    exercises(id, list) {
      const reg = register();
      if (!reg) { console.warn("COURSES.exercises: js/exercises.js is not loaded; " + id + "'s cards are dropped"); return; }
      if (!id || !Array.isArray(list)) { console.warn("COURSES.exercises: needs an id and a list", id); return; }
      const taken = new Set();
      reg.forEach((e) => { taken.add(e.id); (e.tabs || []).forEach((t) => { if (t.alias) taken.add(t.alias); }); });
      list.forEach((e) => {
        const names = [e && e.id].concat(((e && e.tabs) || []).map((t) => t.alias).filter(Boolean));
        const clash = names.find((n) => !n || taken.has(n));
        if (!e || !e.id || clash !== undefined) {
          console.warn("COURSES.exercises(" + id + "): " + (e && e.id ? "id " + clash + " is already in the register" : "a card has no id") + " — skipped");
          rejected.push({ course: id, id: e && e.id, clash: clash });
          return;
        }
        names.forEach((n) => taken.add(n));
        reg.push(Object.assign({}, e, { course: id, home: "courses/" + id + "/exercises" }));
      });
    },
    get: (id) => all.get(id) || null,
    list: () => [...all.values()],
    /** Cards COURSES.exercises refused (duplicate ids), for check_pack.py. */
    rejected,
    /** The active course, or null (whole register). An unknown id is ignored. */
    active() { const id = resolve(); return (id && all.get(id)) || null; },
    /** Switch course for this visit (null/"" = none). */
    choose(id) { chosen = id || ""; store(chosen); },
  };
})();
// What the exercise menu reads. A getter, so courses registered after this
// file (and a later COURSES.choose) are seen without any ordering dance.
Object.defineProperty(window, "EXERCISE_MENU", { get: () => COURSES.active(), configurable: true });

// The keys a course.js object may carry; check_pack.py rejects any other, so
// a misspelt switch fails the pack instead of being silently ignored.
const COURSE_KEYS = ["id", "title", "sections", "hosts", "briefLink", "showAllLink",
  "compact", "collapsible"];
