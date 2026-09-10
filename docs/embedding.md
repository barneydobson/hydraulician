# Putting an exercise in Blackboard or Canvas

How to sit one exercise inside a module page, beside the brief, instead of
behind a link. No grade passback, no LTI, no identity: the LMS stays the
submission layer it already is, and the app stays the instrument.

## The tag

```html
<iframe src="https://barneydobson.github.io/hydraulician/?ex=<ID>&embed=1"
        width="100%" height="640" allow="fullscreen"
        title="hydraulician · <ID>" style="border:0"></iframe>
```

Replace `<ID>` with the exercise id (`HJ-1`, `HS-1`, …). `allow="fullscreen"`
matters: without it the strip's full-screen button has nothing to ask for and
hides itself.

The Rig section of Controls has a faster way to get this than typing it. Load
the exercise, open Controls → Rig, and press **⧉ Embed code**, next to Share
link. It writes the tag into the box and the clipboard, with `src` built from
the page you are actually on — so it carries the exercise or scene that is
loaded, and, once anything has been drawn or a gauge placed, a `#rig=` on
the end so the embed opens with that pre-drawn rig already in place. Pressing
it from `file://` or `localhost` gets a tag that points at your own machine;
the panel says so under the box, because that link works for you and nobody
else. Run it from the published app when the tag is for students.

## What `embed=1` changes

Nothing about the physics or the controls — only how the frame behaves as a
small window inside someone else's page.

- **The card starts folded.** An embedded exercise lands with its brief
  folded to the edge tab rather than open over the water, so the frame's
  width goes to the flume, not the card. The tab reads **`<id>` · open
  instructions** — that wording is not embed-only, it is what the tab says
  everywhere, because a folded tab that only names the exercise does not
  tell a student there is a brief behind it.
- **× parks the card instead of closing it.** Embedded there is no strip
  button to hunt for to bring the brief back, so the card's × folds it to the
  tab rather than hiding it outright.
- **A plain wheel scrolls the page.** The frame itself never scrolls, so a
  plain wheel over the water is left alone and chains to the surrounding
  page, the way any other embedded content behaves. **Ctrl + wheel zooms**
  the flume instead — the same gesture a trackpad pinch already sends. A
  one-time toast explains this the first time a student's plain wheel does
  nothing. Outside an iframe (`embed` absent), the wheel zooms as it always
  has.
- **A pop-out button opens the exercise in a full window.** "Open in a new
  tab" on the strip carries across whatever the student has drawn so far —
  it is the same `?ex=…#rig=…` link the Embed-code button writes, with
  `embed` stripped so the new tab is a normal, full-window session. This is
  where the actual measuring happens once the frame is too small for it.
- **The full-screen button** takes the app to the whole screen without
  leaving the tab; it needs the iframe's `allow="fullscreen"` to work at all
  and simply does not appear when that attribute is missing.

Nothing else moves: the strip, the legend, the status line and an
exercise's own `ui` profile are exactly as they are outside a frame.

## Canvas

Two ways, in order of how much of the editor you trust:

- **External URL module item.** Add the item as an External URL, paste the
  published link (`…?ex=<ID>&embed=1`), and leave **"Load in a new tab"
  unticked**. Canvas then renders it inside the page rather than sending the
  student away from the module.
- **Rich Content Editor, HTML view.** Paste the `<iframe>` tag directly into
  the editor's HTML source view (the `</>` button) rather than trying to
  build it through the visual embed dialog, which tends to want a video URL
  it recognises rather than an arbitrary page.

## Blackboard Ultra

- **Web Link content item**, set to **open inside the course** rather than a
  new window — Ultra then frames it the same way it frames any other
  in-course link.
- **The editor's insert-from-web embed**, which accepts a raw URL or an
  `<iframe>` snippet directly in a content block.

Both Canvas and Blackboard routes are marked **to be confirmed** below: each
editor sanitises pasted HTML differently, some strip `allow` or `style`
attributes, and only someone with a real course to paste into can find out
which. Try the tag, note what happened, and fill in the table.

## Size

Full column width, and 600–650 px tall — enough height for the strip, the
flume and the gauge readouts without the frame becoming a letterbox. Below
about 700 px wide, treat the frame as a preview rather than the place the
exercise gets done: the pop-out button is there for exactly that, and a
sentence on the module page saying "use the pop-out to draw and measure" is
worth more than trying to make a narrow frame do everything.

That threshold comes from measuring the app's own responsive breakpoints at
a handful of common iframe widths:

- At **1000 px** wide the exercise card docks beside the water rather than
  covering it, leaving about 650 px of flume.
- At **800 px** the card would overlay the right half of the frame — wide
  enough that a student loses the tailwater gauge behind it — which is why
  an embedded boot starts folded rather than open.
- At **600 px** the card would render as a bottom sheet across most of the
  frame; a module page this narrow is really asking for the pop-out.

## What to tell students

A line near the frame, or in the brief above it, covering what the app
needs and does not do:

- It needs **WebGL2** and a GPU-backed browser — a lab machine or almost any
  laptop from the last several years; a browser running under remote desktop
  or heavy virtualisation may not have one.
- It **stores nothing and sets no cookies** — there is nothing to consent
  to, and nothing carries over between sessions except what is in the link
  itself (a `#rig=` fragment, which never leaves the browser's address bar).

## Confirmed placements

Neither LMS recipe above has been tried against a real module yet. Paste the
tag, note what happened — did the panel dock as expected, did the editor
strip anything, did full screen and the pop-out work — and record it here.

| Placement | Status | Date |
| --- | --- | --- |
| Canvas | not yet confirmed — paste the tag and record what happened here | |
| Blackboard Ultra | not yet confirmed — paste the tag and record what happened here | |
