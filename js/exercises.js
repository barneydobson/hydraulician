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
 * document. Each folder's README is lecturer-only: derivation, worked
 * answers and verification. HS-1 is the model for a concise standalone card.
 *
 * Every number on a card is the SHIPPED value from the demo's own README —
 * remeasured constants, not the ones a programme sheet promised (the
 * original pack's history of amended rules is in
 * courses/original/CHANGES-NEEDED.md §2b).
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
 * OTHER FIELDS
 *   id       programme id, e.g. "HJ-1"           title    the README's own h1
 *   aim      optional: one or two plain sentences on what the scene is and
 *            what the student does in it. When present the exercise menu
 *            prints it under the title (instead of the start · ?scene · settle
 *            line) and the start screen shows it on hover; it is NOT on the
 *            card. Written in the vocabulary of the lecture it is used in.
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
 *   aim      optional: ONE line on what the exercise is for; the exercise
 *            menu shows it in place of `start`.
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
 *   ui       the UI PROFILE: what of the interface this exercise wants in
 *            front of a student (UIMODE in js/main.js). Families are `build`,
 *            `measure` and `view` — each `true`, `false`, or the list of tool
 *            ids that survive — plus `fields` (which colourings the legend
 *            offers), `panel` ("full" / "focused" / "shut"), `controls`
 *            (the individual Controls-panel row ids that survive),
 *            `readouts` ({gauges, cursor, status, rows}), `gaugeFields` (the
 *            GAUGE_QTY ids a gauge may plot), `hide` (concepts withheld from
 *            the canvas words: "energy", "critical") and `fieldText` (a
 *            field's description, reworded for the card's lecture).
 *            docs/making-exercises.md has each of them.
 *   gauges   optional [{x, z, field}]: gauges the card arrives with already
 *            PLACED — the one exception to "the picker places none", for a
 *            card whose subject is a time series from t = 0 (VC-2).
 *
 *            MOSTLY IT IS DERIVED, so most entries carry no `ui` at all.
 *            `instruments` narrows MEASURE to the tools it names; an entry
 *            naming no build tool loses BUILD, on the reasoning that an
 *            exercise arrives with its rig already built; and the panel opens
 *            focused on the sections its own controls live in. What you write
 *            here is merged ON TOP of that derivation.
 *
 *            SO: a card whose `task` or `setup` tells a student to draw, cut,
 *            erase or move something MUST say `ui: { build: true }` or name a
 *            build tool in `instruments`. Otherwise the derivation takes the
 *            tools away and the student is told "Erase is off for this
 *            exercise" by a card that just told them to erase. check_pack.py
 *            fails the pack over it, because the alternative is a tool that is
 *            silently not there.
 *
 *            A profile is never a cage — the `⋯` on the strip restores
 *            everything in one click, which is what keeps the standing
 *            acceptance test (the sandbox reproduces any scene by hand) true.
 *
 * A card must stand alone. `start` describes the bench, `instruments.where`
 * gives the stations and `task` says what to do and read afterwards. Use
 * `setup` for ordered steps and necessary calculation data. Do not send the
 * student to the README for an equation, a procedure or what to record.
 * Derivations, worked answers and verification remain in lecturer notes.
 *
 * `tips` (optional, on an entry or a tab): the card's own lines for the tips
 * strip at the foot of the screen, replacing its scene's `tips` while the
 * card is on screen — plain text with the inline markup ({tool:…}, {btn:…},
 * {key:…}), in the vocabulary of the lecture the card belongs to. Without
 * it the scene's tips show, as before (docs/making-exercises.md, "The tips
 * line").
 *
 * Standing rules every worksheet carries: Resolution Medium · wait out the
 * settle · median-of-the-wobble reads, never one frame · after changing q,
 * re-check any tailwater ≥ 1.3·d_c · keep the tab visible.
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
