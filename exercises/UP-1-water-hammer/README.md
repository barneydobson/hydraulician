# UP-1 · Pressure travels at the speed of sound

**Aim:** shut a valve at the end of a long pipe and watch the pressure jump
run back up it at the speed of sound, reflect and return.

A reservoir at constant level feeds a long straight horizontal pipe, which
discharges through a valve at its downstream end into a small tank that
overflows and spills away. The flow is steady. Shut the valve suddenly and
the pressure rise does not appear everywhere at once: gauges along the pipe
respond one after another as a pressure wave runs up the pipe at the speed
of sound c, reflects at the reservoir and comes back. Lower c and the delay
between the gauges grows; lower the tank's overflow crest and the water runs
faster and the jump grows.

For the Fundamentals lecture (compressibility and the speed of sound). Two
sliders on the card — the speed of sound c and the overflow crest — are the
things to play with; there is no personalised parameter and nothing to pool.

**Open it:** press **E** in the [app](https://barneydobson.github.io/hydraulician/)
and pick **UP-1**, or use the direct link
[`?ex=UP-1`](https://barneydobson.github.io/hydraulician/?ex=UP-1).
How to run any exercise: see the [teaching pack index](../INDEX.md#running-an-exercise).

## Theory

Water is slightly compressible and a pipe wall slightly elastic, so a change
of pressure travels along a pipe as a wave at a finite speed c — about
1000–1400 m/s in a real steel or iron main, a few hundred in a plastic one.
Shutting a valve stops the water next to it at once; the water further up
does not yet know. The front between moving and stopped water runs upstream
at c, and behind it the momentum of the water has become pressure:

    Δp = ρ·c·Δv,   or as a pressure head   Δp/ρg = c·Δv/g

**Pressure head** is the pressure divided by ρg — the pressure expressed as a
height of water. It is the pressure up to a constant factor, so wherever it is
higher, the pressure is higher. It is the colour on screen.

For a sudden, complete shut Δv = v₀, the steady pipe velocity. Two gauges a
distance Δx apart see the front Δt = Δx/c apart. At the reservoir the front
meets a fixed level and reflects with the opposite sign; it returns to the
valve as a low-pressure wave after 2L/c, and the cycle repeats with period

    T = 4L/c

In the model, c is the **Slot celerity** on the Controls panel (the card
calls it the speed of sound c) — the stiffness of the slightly compressible
water the solver uses. It is set far below a real pipe's (30 m/s by default)
so that the wave can be watched; the physics is the same, only slower.

## The bench

| item | where |
|---|---|
| domain | 60 m × 14.5 m |
| reservoir | x = 0 → 5 m, surface held at **12.8 m** (held constant) |
| pipe | 2 m bore, invert z = 1.5 m, centre line **z = 2.5 m**, rounded mouth at x = 5 m |
| valve | the pipe's end, x = 51.75 → 52.25 m: **L ≈ 47 m** |
| tank | x = 52.25 → 58.4 m, overflows a crest (card slider, **10.6 m**, range 10.2–11.6 m) onto a chute that spills out of the right edge |
| water over the centre line | about 10 m while flowing (10.3 m at rest) |

The tank exists only to take the water away cleanly: its level is set by the
overflow, so the steady pipe velocity v₀ follows from the level difference
between reservoir and tank (entry, friction and exit losses), with nothing in
the pipe to throttle it. Once the valve is shut it is a plain closed end and
the tank no longer matters.

## What to do

1. The card opens on a steady flow (the countdown waits out **25 s**). The
   colour is Pressure head (see Theory).
2. Place Gauges (`5`) on the pipe's centre line, **z = 2.5 m**, at
   **x = 14, 30 and 46 m** — 16 m apart. Open their windows from Controls →
   **Gauge inspector** and drag the three windows above the pipe. They plot
   the speed |u|: read **v₀**.
3. Press **V** (Shift+V also works). The colour shows a band of high pressure
   leaving the valve. The speed at 46 m drops to zero first, then at 30 m,
   then at 14 m. Pause (space) and read the three times in the windows: the
   delay over 16 m should be 16/c.
4. Hover the cursor on the pipe either side of the front and read the
   pressure head: it jumps by about c·v₀/g. Let it run: the wave reflects at
   the reservoir as low pressure and the cycle repeats with period 4L/c.
5. Press **V** to reopen, set **c = 20 m/s** on the card, press **R** and wait
   for the countdown. Shut it again: the delay grows about 1.5 times and the
   jump shrinks.
6. Lower the **overflow crest** on the card (it restarts the water): v₀
   rises, and so does the jump.

## For the instructor

### In the lecture

- Open `?ex=UP-1`; the countdown runs flat out (25 s of simulated time, a
  few seconds of wall clock on a decent GPU), then Speed drops to ×0.25 so
  the wave crosses the 47 m pipe in about 6 s of wall clock at c = 30.
- Place the three gauges during the countdown, open the inspector windows
  and park them over the empty space above the pipe.
- Press V, let the wave run there and back once, pause, and read the times.
- Set c = 20 on the card, V to reopen, R, wait, and repeat. Then show the
  crest slider (it restarts the water by itself).
- Speed is on the Controls panel; ×1 is fine for a second showing.

### Measured

Measured on Resolution Medium (627 × 152 cells, Δx = 0.096 m; 21 cells
across the bore) with `rig.js`, the app's frame loop paused so the 5 ms
record is uniform; each row from rest (R), settled 25–26 s, then shut.
Arrival = the first sample half-way up the expected rise; jump = median of
the 46 m gauge's first plateau; period = successive up-crossings at 46 m.
v₀ is the bore-mean u (19 points across the bore at x = 22 and 38 m); the
gauge's |u| reads the centre-line cell. Pressure heads are p/ρg on the
centre line (z = 2.5 m); "crown" is 1 m higher, the top of the bore.

| reading | c = 30, crest 10.6 (as it opens) | c = 20, crest 10.6 | c = 30, crest 10.2 (lowest) | c = 30, crest 11.6 (highest) | c = 35, crest 10.6 |
|---|---|---|---|---|---|
| v₀, bore mean / 46 m gauge | 2.25 / 2.38 m/s | 2.06 / 2.17 | 2.73 / 2.72 | 1.10 / 1.09 | 2.31 / 2.31 |
| steady p/ρg at 46 m | 9.75 m | 9.74 | 9.63 | 10.06 | 10.05 |
| arrival at 46 / 30 / 14 m | 0.191 / 0.706 / 1.220 s | 0.272 / 1.007 / 1.742 | 0.191 / 0.712 / 1.226 | 0.191 / 0.700 / 1.208 | 0.168 / 0.614 / 1.061 |
| Δt over 16 m (both pairs) | 0.514, 0.514 s | 0.735, 0.735 | 0.520, 0.514 | 0.508, 0.508 | 0.446, 0.446 |
| 16/c | 0.533 s | 0.800 | 0.533 | 0.533 | 0.457 |
| jump in p/ρg at 46 m | 7.16 m | 4.90 | 8.85 | 3.70 | 8.35 |
| c·v₀/g, bore / gauge v₀ | 6.87 / 7.27 m | 4.20 / 4.43 | 8.36 / 8.32 | 3.35 / 3.32 | 8.23 / 8.25 |
| lowest p/ρg at the crown (after reflection) | **2.3 m** | 4.7 | **0.75** | 5.5 | **0.54** |
| period | 6.25 s | 8.88 | 6.27 | 6.24 | 5.43 |
| 4L/c, L = 46.75 m | 6.23 s | 9.35 | 6.23 | 6.23 | 5.34 |

So at the card's c = 30 the delay is 16/c to 4% (the wave runs a little
faster than c, see below), the jump is c·v₀/g to 4% with the bore v₀ and
1–2% with the gauge's |u|, and the period is 4L/c to 0.5%. Lowering the crest
from 11.6 to 10.2 m takes v₀ from 1.1 to 2.7 m/s (the old scene ran 1.35 m/s)
and the jump from 3.7 to 8.9 m. c = 20 gives 1.43× the delay of c = 30
(1.5 expected) and 0.68× the jump.

**Column separation.** The low-pressure return wave takes the crown down by
about the jump. At c = 30 it stays above zero over the whole crest range
(0.75 m left at the lowest crest), which is why the crest slider stops at
10.2 m: at 9.6 m v₀ = 3.4 m/s, the jump is 10.7 m and the crown goes to
zero (measured). The card's c slider stops at 35 m/s: 0.5 m left at the
default crest, but at c = 35 with the crest at 10.2 the crown reaches zero
and the column separates (measured −0.4 m by extrapolation from the centre
line). The panel's own Slot celerity row still runs 8–400.

**Why not below c = 20.** The slot carries the water's weight as compression,
f − 1 = g·d/c² (0.12 under 11 m of water at c = 30, 0.27 at c = 20, 0.48 at
c = 15), and the compressed water carries the wave a little faster than c
(about c·√f) and slows the steady flow. At c = 15 the delay over 16 m was
0.90 s against 16/c = 1.07 s and v₀ fell to 1.87 m/s, so the card's slider
stops at 20, where the delay is 8% short of 16/c.

**Settle.** From rest the bore-mean velocity is within 2% of its final value
by about 16 s (2.23 m/s at 15 s, 2.25 at 17 s, 2.22–2.25 after). The
pressure at the gauges still rings by ±0.3–0.4 m at 26 s — the start-up
organ-pipe mode, period 4L/c ≈ 6 s, which wave damping (0.03) takes out
slowly; it is small against the 7 m jump and invisible on the speed traces.
The card waits **25 s** (the scene's own spin-up is 20 s); after R or a crest
change the same countdown runs again, flat out.

**The outlet.** The hammer scene throttles the pipe with a nozzle that jets
out of the domain; here nothing throttles the bore. The tank's overflow crest
sets the tank level (the crest plus the depth spilling over it), and the level
difference between the reservoir and the tank drives the pipe. A free discharge to air is not
possible without a throttle: unthrottled, v₀ ≈ √(2g·10) ≈ 14 m/s and
c·v₀/g ≈ 43 m would empty the pipe on the return wave.

### Speed

The lecturer reported "it runs quite fast, then at one point slows down
dramatically, and now it is extremely slow". Measured in headless Chrome
(ANGLE/D3D11, 1600 × 1000) on `?ex=UP-1` as the card opened it, with three
gauges on the axis, their three inspector windows open and particles on:

- **The card's own Speed setting was most of it.** The countdown runs the
  solver flat out until the settle time; then the loop drops to Speed × real
  time, and the card set ×0.1. Headless (on a shared GPU) that was 0.15–0.5
  simulated s per wall s during the countdown, then 0.07–0.09; on a free
  desktop GPU the countdown runs several times real time, so the drop is
  30–50×. The card now sets **×0.25** (the wave still takes about 6 s of wall
  clock to cross the pipe at c = 30), and Speed is on the panel.
- **The gauges were the second cause, not the inspector.** After the settle
  a frame cost 50–73 ms (14–20 fps); 40–60 ms of it was `SIM.probe`, called
  once per gauge per frame, each call two synchronous `readPixels` (the CPU
  profile: 73% of self time in `readPixels`). With no gauges the same page
  ran 59 fps at 6 ms a frame. A synchronous read waits for the GPU, so it
  costs whatever the GPU is still doing, not the size of the read. Fixed in
  shared code: `SIM.probeMany` reads every gauge on one grid row with a
  single `readPixels` (gauges never use the fill, so its texture is not
  read) — six reads a frame become one, values bit-identical. Interleaved
  A/B in one page on a busy machine: 7.4 fps → 13.7 fps (no read at all:
  18.8 fps).
- **Not the cause:** the inspector windows cost 2 ms a frame at 1k samples and
  4.2 ms at the full 20k each (three windows) — real but small, and left
  alone; the corner charts are withheld on this card; particles 0.03 ms; the
  solver's own CPU cost 0.2–0.3 ms. Nothing changed after the slam (no
  column separation, the solver's work is the same). Averaging is off.

If it is still slow on a classroom machine, an asynchronous gauge read (a
pixel-pack buffer and a fence, sampled a frame late) would remove the last
synchronous read; not done here because it changes when a sample lands.

### Interface

No build tools; MEASURE is the Gauge only; fields Pressure head, Water and
Speed. Two card sliders: the speed of sound c (the panel's Slot celerity,
limited on the card to 20–35 m/s) and the overflow crest (Geometry, 10.2–11.6
m). The gauges plot speed; the hover readout is cut to position, velocity and
pressure head. The corner gauge cards are withheld: stacked in the
bottom-right corner they cover the valve and the 46 m gauge. The inspector
windows still list h (piezometric head) and H (total head) beside the speed —
that list is shared by every exercise and is not trimmed per card.

### Discussion points

- **Pressure is not transmitted instantly.** The statics lecture says a
  pressure change is felt throughout a connected body of water; this is the
  footnote — it is felt after the time sound takes to cross it.
- **The jump does not depend on the pipe length,** only on c and v₀. The
  length sets how long it lasts (2L/c at the valve), which is why a valve
  closed in less than 2L/c counts as instantaneous.
- **Real numbers.** At c = 1200 m/s, stopping 2 m/s gives a pressure head
  jump of about 245 m — twenty-four atmospheres from shutting a tap quickly
  on a long main.
- **Why the low-pressure half matters.** After the reflection the pressure at
  the valve falls about as far below its steady value as it first rose above
  it. Raise c until c·v₀/g approaches the ~9 m of water over the pipe's crown
  and the low-pressure wave reaches zero pressure: the column separates.

`rig.js` is the console spot-check: `UP1.demo()` places the gauges, restarts
from rest, settles 25 s, slams and prints a column of the table above;
`UP1.demo(20)` repeats it at c = 20 m/s; `UP1.demo(30, 25, 10.2)` at the
lowest crest. Its numbers are piezometric (h = z + p/ρg) — the lecturer's
spot-check, not the students' view.
