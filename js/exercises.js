"use strict";
/**
 * exercises.js — the exercise register, and the card schema.
 *
 * EXERCISES is the one list the picker reads. It starts EMPTY here: every
 * card now lives in a course folder — courses/<id>/exercises.js calls
 * COURSES.exercises(id, [...]) (js/courses.js), which appends its cards to
 * this list stamped with `course` and `home`. The original teaching pack is
 * courses/original/ (the main site's default course); CIVE40008's Year 1
 * cards are courses/cive40008/. This file must still load BEFORE
 * js/courses.js and the course files, because it declares the list they
 * append to — and this header is the schema every course's cards follow.
 *
 * The card is the complete student exercise: setup, assignment, actions and
 * readings, including any data/formulas needed to do it without another
 * document. Each folder's README is lecturer-only (defined once, below).
 * HS-1 is the model for a concise standalone card.
 *
 * Every number on a card is the SHIPPED value from the demo's own README —
 * remeasured constants, not the ones a programme sheet promised: each value
 * is the one the demo's README measured.
 *
 * THE LINE THIS FILE DRAWS — read before adding a value
 * ----------------------------------------------------
 * The picker gives every student an identical STARTING POINT and the correct
 * INFORMATION for their exercise. It does not do the exercise. A student who
 * sets their tailwater below critical depth gets a drowned jump and learns
 * something; padding that away would be teaching nothing. So each value belongs
 * to exactly one of four fields, and the split is the whole point of the
 * schema:
 *
 *   rigParams      APPLIED. The plumbing without which the rig is not a
 *                  physically working rig: the resolution the geometry was
 *                  captured at, the open/closed edges, which supplies and
 *                  controls exist, and the levels/constants a README documents
 *                  as load-bearing (FR-1's 2.50 m tailwater, DA-1's Very high
 *                  resolution). CONTROLS ids → values;
 *                  key ORDER matters, because ticking a level control opens its
 *                  own edge, so edges come first.
 *   viewParams     APPLIED. Display and readout only — Field, Gauges plot,
 *                  the overlays, Speed, tracers, dye. These set no physics and
 *                  give nothing away; they are how the demo is meant to be
 *                  LOOKED at (UN-3 is unreadable on the Head channel).
 *   studentParams  DISPLAYED, NEVER APPLIED. Values the worksheet asks the
 *                  student to set, that no digit rule covers — a staged step
 *                  (B9's two level controls), an assigned cell (B5). Each is
 *                  {control, value?, unit?, rule?, slider?, label?}. The card
 *                  draws the control as a field to set; a Geometry row is a
 *                  slider, and `slider: {min, max, step}` makes any other
 *                  numeric row one too, over the range worth playing in
 *                  (UP-1's c). `label` renames the row on the card only.
 *                  Slider rows sit under "Try it yourself" when the entry has no digit.
 *   digit          DISPLAYED, NEVER APPLIED (with one exception, below). The
 *                  personalised parameter: `base` + `step`·d, or a per-digit
 *                  `table` where the measured rule is not linear, `mod: N` for
 *                  "d mod N" rules, `also: [...]` for the coupled values the
 *                  worksheet makes them derive, `rule` for the sentence that
 *                  says WHY (HJ-1's 1.3·d_c). The card prints the RULE and the
 *                  panel row it goes on — "q (m²/s): q = 0.42 + 0.03·d" — and
 *                  the student does the arithmetic; d is their student
 *                  number's last digit and the lecturer owns explaining it.
 *                  Nothing is computed or written for them.
 *
 * The exception: `rigTable` picks WHICH captured drawing loads, because B8's
 * three orifice lips are different rigs, not different numbers, and nobody is
 * going to hand-draw them. Geometry is part of the common starting point.
 *
 * OTHER FIELDS (every key CARD_KEYS allows; TAB_KEYS below for `tabs`)
 *   id       programme id, e.g. "HJ-1"           title    the README's own h1
 *   topic    grouping for the menu (the register by topic, ?course=none)
 *   folder   the brief's folder, courses/<id>/exercises/<folder>/ for a card
 *            in courses/<id>/exercises.js — COURSES.exercises stamps it with
 *            `home`, the directory its folder sits in, and `course`. A card
 *            with no `home` would sit in exercises/<folder>/ (none does now)
 *   scene    a SCENES key, or "sandbox"
 *   rig      null, or a key into EXERCISE_RIGS (js/exercises-rigs.js). A rig
 *            pointer with no pack loaded is not an error: the scene and the
 *            settings still apply and the card says to draw the rig from the
 *            README.
 *   instruments  where the gauges and rakes GO, as instructions — the picker
 *            places none of them (and clears any a rig payload carried),
 *            because choosing where to measure is part of every one of these
 *            exercises. {tool, where, why}. The card prints `where`; `why` is
 *            for whoever maintains the entry.
 *   digitNote  the rule itself, printed where the personalised thing is drawn
 *            geometry or a station on screen — there is no control to set.
 *   setup    the ordered sequence a snapshot cannot hold ("fill it, THEN shut
 *            the valve"). Steps for the student to follow, never automated.
 *            A card with `steps` ignores `setup`.
 *   steps    the short layout: at most FIVE lines, in order, with the inline
 *            markup of `tips` ({tool:…}, {btn:…}, {key:…}). When present the
 *            card prints these INSTEAD of `start`, `task` and the Instruments
 *            line, which the steps carry themselves.
 *   background  optional: a string or a list of paragraphs for the material a
 *            step cannot hold — a definition, a formula, a remark. Folded away
 *            at the foot of the steps, closed until the student opens it.
 *   aim      optional: one or two plain sentences on what the scene is and
 *            what the student does in it. The exercise menu prints it under
 *            the title (in place of the start · ?scene · settle line); the
 *            start screen shows it on hover; it is NOT on the card. Written in
 *            the vocabulary of the lecture it is used in.
 *   start    ONE short line on what is on the bench when the card opens —
 *            "a chute onto a level apron, with a tailwater control".
 *   task     ONE or two short lines on what to do, INCLUDING what to read off
 *            the screen at the end of it.
 *   note     one sentence for the thing on screen that is NOT part of the
 *            exercise but will get asked about anyway (HP-1's scene valve).
 *            Rare on purpose.
 *   settle   sim-seconds to wait, from the demo's verification record. The
 *            picker runs the solver flat out for this long, exactly as a
 *            scene's own `spinup` does, so it is not a wall-clock wait.
 *   rigWhy   why a `rigParams` value is what it is, keyed by the same control
 *            id — "at the stock 0.16 the tanks equalise in 2–6 s and there is
 *            nothing to time". Maintenance prose, like `instruments[].why`:
 *            NOT printed on the card. It exists so the next person to touch a
 *            load-bearing constant knows what it is holding up.
 *   secondScene  an optional coda the card offers as a suggestion — {scene,
 *            when}. Nothing is applied; the student switches by hand from the
 *            Scenes menu, and `when` is the sentence that says why.
 *   tips     optional, on an entry or a tab: the card's own lines for the tips
 *            strip at the foot of the screen. They replace the scene's `tips`
 *            while the card (or the tab) is on screen ON ITS OWN SCENE; a tab
 *            without `tips` inherits the entry's. Plain text with the inline
 *            markup, in the vocabulary of the lecture the card belongs to.
 *            Without it the scene's tips show, as before (docs/making-
 *            exercises.md, "The tips line"). A non-empty list of non-empty
 *            strings.
 *   tabs     optional: one scene asking several questions (CR-1 is streamlines,
 *            continuity and forces, in three tabs). A list of objects with the
 *            TAB_KEYS: `key` (unique) and `label` name the tab; `alias` is the
 *            id the question had before it became a tab, so an old `?ex=` link
 *            still opens it. `title`, `topic`, `aim`, `steps`, `background`,
 *            `tips`, `instruments` and `studentParams` replace the entry's own;
 *            `ui` and `viewParams` are merged over the entry's, shallowly. The
 *            scene, the rig, `rigParams` and `settle` are the entry's alone:
 *            switching tabs swaps the steps and the profile, never the bench.
 *            Addressed as ID#key, or by its alias.
 *   ui       the UI PROFILE: what of the interface this exercise wants in
 *            front of a student (UIMODE in js/main.js). Families are `build`,
 *            `measure` and `view` — each `true`, `false`, or the list of tool
 *            ids that survive — plus `fields` (which colourings the legend
 *            offers), `legend` (`false` closes the legend), `panel` ("full" /
 *            "focused" / "shut"), `controls` (the individual Controls-panel row
 *            ids that survive), `readouts` ({gauges, cursor, status, rows}),
 *            `gaugeFields` (the GAUGE_QTY ids a gauge may plot), `hide`
 *            (concepts withheld from the canvas words: "energy", "critical")
 *            and `fieldText` (a field's description, reworded for the card's
 *            lecture). docs/making-exercises.md has each of them.
 *
 *            MOST CARDS DECLARE IT: every current card carries a `ui`, and the
 *            derivation below still fills in what it omits. `instruments`
 *            narrows MEASURE to the tools it names; an entry naming no build
 *            tool loses BUILD, on the reasoning that an exercise arrives with
 *            its rig already built; and the panel opens focused on the sections
 *            its own controls live in. What you write in `ui` is merged ON TOP
 *            of that derivation.
 *
 *            SO: check_pack.py scans `task`, `start`, `setup` and `steps` for
 *            the verbs draw, draws, drawing, redraw, redraws, erase, sketch,
 *            cut, cuts, move, widen, narrow, shrink. A card that uses one of
 *            them MUST say `ui: { build: true }` or name a build tool in
 *            `instruments`. Otherwise the derivation takes the tools away and
 *            the student is told "Erase is off for this exercise" by a card
 *            that just told them to erase; check_pack.py fails the pack over
 *            it, because the alternative is a tool that is silently not there.
 *
 *            A profile is never a cage — the `⋯` on the strip restores
 *            everything in one click, which is what keeps the standing
 *            acceptance test (the sandbox reproduces any scene by hand) true.
 *
 *   gauges   optional [{x, z, field}]: gauges the card arrives with already
 *            PLACED — the one exception to "the picker places none", for a
 *            card whose subject is a time series from t = 0 (VC-2).
 *
 * A card must stand alone. `start` describes the bench, `instruments.where`
 * gives the stations and `task` says what to do and read afterwards. Use
 * `steps` (or `setup`) for ordered steps and necessary calculation data.
 *
 * THE README, DEFINED ONCE. Every other place that points at a folder's
 * README (AGENTS.md, docs/making-exercises.md, courses/original/INDEX.md and
 * js/courses.js) points here: lecturer notes — derivation, worked answers,
 * verification; a student is never sent there for an equation or a procedure;
 * the one exception is the draw-it-yourself fallback when the rig pack is
 * absent.
 *
 * Standing rules every worksheet carries (courses/original/INDEX.md repeats
 * them verbatim): Resolution Medium · wait out the settle · median-of-the-
 * wobble reads, never one frame · after changing q, re-check any tailwater
 * ≥ 1.3·d_c · keep the tab visible · read promptly (the chart buffer keeps
 * moving).
 *
 * Defines: EXERCISES, CARD_KEYS, CARD_KEYS_STAMPED, TAB_KEYS
 *
 * Reads:   none
 */
const EXERCISES = [];

/* The card schema, machine-readable: every top-level key a card may carry.
 * exercises/_runner/check_pack.py reads these by evaluating this file and
 * fails the pack on any other key, so a misspelt key (`instrument`) is an
 * error rather than a field the app silently never reads. Add a key here in
 * the same commit that teaches the app to read it, and document it above.
 * CARD_KEYS_STAMPED are the two COURSES.exercises writes itself. */
const CARD_KEYS = ["id", "title", "aim", "topic", "folder", "scene", "rig", "rigParams",
  "viewParams", "studentParams", "digit", "rigTable", "instruments", "digitNote", "setup",
  "start", "task", "steps", "background", "note", "settle", "rigWhy", "secondScene", "ui",
  "gauges", "tabs", "tips"];
const CARD_KEYS_STAMPED = ["course", "home"];
/* What one entry of a card's `tabs` may carry: `key`, `label` and `alias`
 * name the tab; the rest are the fields a tab overrides (see EX.view). */
const TAB_KEYS = ["key", "label", "alias", "title", "topic", "aim", "steps", "background",
  "ui", "viewParams", "instruments", "studentParams", "tips"];
