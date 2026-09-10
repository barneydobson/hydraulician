# Embedding an exercise in Blackboard or Canvas — design

Date: 2026-09-10 · Branch: `worktree-embed` (off `main` @ a7038fb)

## Why

A lecturer wants one exercise sitting inside a module page — a Blackboard
Ultra document or a Canvas page — beside the brief, so a student meets the
flume where the reading is, not behind a link. No grade passback, no LTI, no
identity: the LMS stays the submission layer it already is
(`exercises/demo-programme.html` assumes one Blackboard test per hour), and
the app stays the instrument.

Nothing stops this today. The Pages build is HTTPS and sends no
frame-blocking header, `?ex=<id>` skips the start screen, and the app keeps
nothing in browser storage, so a cross-site frame partitions nothing. What
is missing is behaviour fit for a 700–1000 px box, and a page telling a
lecturer how to do it.

## What the frame sizes showed (2026-09-10, HJ-1 booted headless)

| Frame | Card open | Card folded |
| --- | --- | --- |
| 1400 × 800 | docked, 1052 px of water | — |
| 1000 × 650 | docked, 652 px of water; legend and boot toast sit on the flume | whole width |
| 800 × 600 | the card OVERLAYS the right half, hiding the tailwater gauge | a 30 px edge tab; whole flume visible |
| 600 × 500 | the card is a bottom sheet covering all but a sliver of water | strip already dropping tools |

`DOCK` overlays below 900 px (`MINW`) and becomes a sheet below 620 px
(`PHONE`). Most LMS content columns fall in the 700–1000 band, so an
embedded exercise must boot with the card folded, and the frame is a live
illustration; the real measuring happens popped out to a full window.

## Decisions taken (with the user, 2026-09-10)

- **Fold, don't remove.** An embedded boot folds the exercise card to its
  edge tab. The tab keeps the digit rule, the "already set" list and the
  reset button one click away, while the brief itself lives on the LMS page
  around the frame. Removing the card gains nothing visible over folding it.
- **The tab says what it opens.** "HJ-1 · EXERCISE" does not tell a student
  there are instructions behind it. The folded tab reads
  **`<id>` · open instructions** — in every mode, not only embedded, because
  the problem is the label, not the frame.
- **Full screen.** A strip button that takes the app full screen, always
  present when the browser allows it. Inside a frame that needs
  `allow="fullscreen"` on the iframe, which the snippet carries.
- **Pop-out.** An "open in a new tab" strip button, embedded boots only,
  carrying the exercise and the student's current drawing.
- **The wheel yields to the page.** Embedded, a plain wheel scrolls the LMS
  page (the event is left to propagate); ctrl + wheel zooms, which is also
  what a trackpad pinch already reports. A one-time hint says so. Full
  window behaviour is unchanged. (Proposed by Claude; the user did not
  object — recorded here as an assumption.)
- **Opt-in by URL, not by sniffing.** `?embed=1` is the switch. Detecting
  `window !== top` would make the behaviour untestable from a plain tab and
  surprise anyone who frames the app for another reason.

## 1. The `embed` boot

`const EMBED = new URLSearchParams(location.search).has("embed")`, read once
at boot beside `?scene=` / `?ex=`, exposed as `APP.embed` (a boolean) so
gates and the docs can ask.

Effects, all in `main.js` unless said otherwise:

1. **Fold on land.** After the exercise has landed (`EX.ready`),
   `DOCK.fold(true)`. A `#rig=` on the same link still applies afterwards
   (boot already orders the rig after `EX.ready`); folding is a display state
   and does not touch it.
2. **× folds instead of hiding.** In `pickers.js` the card's × calls
   `hide()`, which takes the tab with it. Embedded, there is no strip
   Exercises button worth hunting for, so × becomes a fold. Non-embedded
   behaviour is unchanged: the × closes the brief, the strip brings it back.
3. **Wheel policy.** In the canvas `wheel` listener: if `EMBED && !e.ctrlKey`,
   return without `preventDefault` — the frame is not scrollable, so the
   browser chains the scroll to the parent page. Otherwise as today
   (`preventDefault`, `zoomAt`, the ctrl factor for pinch). The first ignored
   wheel per page shows a toast once: "Ctrl + scroll zooms the flume. Open in
   a new tab for the full window." The `KEYS` sheet's `["wheel", "zoom"]` line
   reads `["ctrl + wheel", "zoom"]` when embedded.
4. **No other chrome changes.** The strip, legend, status and hint line
   stay; the strip already folds families by width and a UI profile already
   narrows it. Reconsider only if the LMS test says otherwise.

## 2. The folded tab

`DOCK.sync` writes the tab's `.kind` as `kind.toLowerCase()` ("exercise").
It writes **"open instructions"** instead when the kind is Exercise (the
only kind today; `DOCK.show("Exercise", id)` and `DOCK.label` are the two
callers, both in `pickers.js`). The tab's `aria-label` becomes "Open the
instructions". The vertical tab grows to about 170 px, so its centring
offset in `css/app.css` (`#docktab { margin-top: -60px }`) moves to half its
new height; the sheet pill (`#dock.sheet ~ #docktab`) is horizontal and
needs nothing.

## 3. Two strip buttons

Both in the uncaptioned `meta` group of `TOOLBAR`, after Controls and before
Keyboard, so they sit with the chrome rather than with a family.

- **`fsBtn` — Full screen / Exit full screen.** `label` and `icon` are
  functions (the `playBtn` pattern). `act` toggles
  `document.documentElement.requestFullscreen()` / `document.exitFullscreen()`;
  `on: () => !!document.fullscreenElement`; a `fullscreenchange` listener
  calls `syncToolbar()` (the window `resize` already runs `DOCK.sync`,
  `fitBar`, `applyAutoVex`). Key **F** — verify it is unbound in the keydown
  switch before claiming it. Hidden when `document.fullscreenEnabled` is
  false (a frame without `allow="fullscreen"`), see `when` below.
- **`popBtn` — Open in a new tab.** Embedded boots only. Opens the current
  exercise or scene with `embed` stripped from the query and the student's
  current state as `#rig=`. Because `RIG.link()` may be asynchronous
  (deflate), open the window synchronously inside the click and navigate it
  when the link resolves — `const w = window.open("", "_blank");
  w.opener = null; RIG.link().then((u) => { w.location = stripEmbed(u); })` —
  which is what survives pop-up blockers. `?ex=…#rig=…` is already the
  documented "this exercise, with my own rig on it" boot.

Both need an optional **`when: () => boolean`** on a strip item, honoured in
`buildToolbar` beside `UIMODE.allows`, and two `ICONS` entries (`fullscreen`,
`popout`) in the existing 20 × 20 stroke style. `when` is a boot-time
property (embed flag, fullscreen capability), so filtering in `buildToolbar`
is enough; `syncToolbar` need not re-read it.

## 4. The lecturer's snippet

The Rig section of Controls already has **⇪ Share link**. Beside it,
**⧉ Embed code** puts this in the box and on the clipboard:

```html
<iframe src="<origin+path>?ex=HJ-1&embed=1" width="100%" height="640"
        allow="fullscreen" title="hydraulician · HJ-1" style="border:0"></iframe>
```

The `src` is the current page's origin and path plus `?ex=<id>` (or
`?scene=<id>` when no exercise is loaded), `embed=1`, and the current
`#rig=` when anything has been drawn (through `RIG.link()`, so a lecturer
can embed a pre-drawn rig). Under `file://` or `localhost` the note beneath
says so: "generated from this address — run it from the published app for a
link students can open". The docs page carries the same template with
`<ID>` for a lecturer who never opens the panel.

## 5. Documentation

New **`docs/embedding.md`** — "Putting an exercise in Blackboard or Canvas":

1. The snippet, and what `embed=1` changes (folded card, ctrl + wheel,
   pop-out, full screen).
2. Canvas: an External URL module item with "load in a new tab" unticked, or
   the iframe pasted in the Rich Content Editor's HTML view.
3. Blackboard Ultra: a Web Link item set to open inside the course, or the
   editor's insert-from-web embed. Both recipes are marked **to be
   confirmed in the module** — editors sanitise differently, and only a
   lecturer with the course can check.
4. Size: full column width, 600–650 px tall; below about 700 px wide the
   frame is a preview and the pop-out is where the exercise is done.
5. Requirements a module page should state: WebGL2, a GPU-backed browser
   (lab machines), and that the app stores nothing and sets no cookies.

Registered in `docs/view.html`'s nav list, the AGENTS.md docs table, and one
line in README's Exercises section. `docs/making-exercises.md` is
untouched: embedding is a property of the app, not of a card.

## 6. What the gates ask

- `test/ui-smoke.mjs` gains **"an embedded exercise keeps the water"**: a
  second browser at 800 × 600 (the phone case's pattern), `?ex=HJ-1&embed=1`,
  after `EX.ready`: the tab is shown and reads "open instructions", the dock
  is not open, `canvas.clientWidth === innerWidth`, the pop-out button exists
  and the full-screen button follows `document.fullscreenEnabled`, a
  synthetic wheel without ctrl leaves the view transform unchanged and is not
  default-prevented, one with ctrl changes it. The existing `?ex=` case at
  1440 keeps its docked expectations — `embed` off changes nothing.
- `smoke.js --only=api,rig` after the `js/` edits; the instant gates always.
- The manual step nobody else can do: the snippet pasted into the real
  Ultra document and a Canvas page, once each, recorded in the docs page as
  confirmed or not.

## Out of scope, deliberately

LTI 1.3, SCORM, grade passback, a Common Cartridge of the pack, a digit
carried in the URL, a reading token, an in-app class plot. All brainstormed
on 2026-09-10 and parked; the user's need is one exercise on one page.
