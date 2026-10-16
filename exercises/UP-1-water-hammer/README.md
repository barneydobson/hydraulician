# UP-1 · Pressure travels at the speed of sound (water hammer)

A reservoir at constant level feeds a long straight horizontal pipe, which
discharges through a valve at its downstream end into a small tank that
overflows and spills away. The flow is steady. Slam the valve and the
pressure rise does not appear everywhere at once: gauges along the pipe
respond one after another as a pressure wave runs up the pipe at the speed
of sound c, reflects at the reservoir and comes back. Lower c and the delay
between the gauges grows.

This is a **lecturer demo** for the Fundamentals lecture (compressibility
and the speed of sound): no personalised parameter, nothing to pool.

**Open it:** press **E** in the [app](https://barneydobson.github.io/hydraulician/)
and pick **UP-1**, or use the direct link
[`?ex=UP-1`](https://barneydobson.github.io/hydraulician/?ex=UP-1).
How to run any exercise: see the [teaching pack index](../INDEX.md#running-an-exercise).

## Theory

Water is slightly compressible and a pipe wall slightly elastic, so a change
of pressure travels along a pipe as a wave at a finite celerity c — about
1000–1400 m/s in a real steel or iron main, a few hundred in a plastic one.
Shutting a valve stops the water next to it at once; the column further up
does not yet know. The front between moving and stopped water runs upstream
at c, and behind it the momentum of the column has become pressure:

    ΔH = c·Δv/g          (Joukowsky)

For a full, instantaneous closure Δv = v₀, the steady pipe velocity. Two
gauges a distance Δx apart see the front Δt = Δx/c apart. At the reservoir
the front meets a fixed level and reflects with the opposite sign; it returns
to the valve as a low-pressure wave after 2L/c, and the cycle repeats with
period

    T = 4L/c

In the model, c is the **Slot celerity** on the Controls panel — the
stiffness of the slightly compressible water the solver uses. It is set far
below a real pipe's (70 m/s by default) so that the wave can be watched; the
physics is the same, only slower.

## The bench

| item | where |
|---|---|
| reservoir | x = 0 → 5 m, surface held at **16.0 m** (head-driven inflow) |
| pipe | 2 m bore, invert z = 2 m, axis **z = 3 m**, rounded mouth at x = 5 m |
| valve | the pipe's end, x = 51.75 → 52.25 m: **L ≈ 47 m** |
| tank | x = 52.25 → 58.4 m, overflows a crest at z = 14.65 m onto a chute that spills out of the right edge |
| static head on the axis | about 12.8 m while flowing (13 m at rest) |

The tank exists only to take the water away cleanly: its level is set by the
overflow, so the steady pipe velocity v₀ follows from the small level
difference between reservoir and tank (entry, friction and exit losses), with
nothing in the pipe to throttle it. Once the valve is shut the valve is a
plain closed end and the tank no longer matters.

## What to do

1. The card opens on a steady flow (the countdown waits out about **20 s**).
   Place Gauges (`5`) on the pipe axis, **z = 3 m**, at **x = 14, 30 and
   46 m** — 16 m apart. Open their histories from Controls → **Gauge
   inspector** and park the three windows above the pipe. Speed is ×0.1.
2. Read **v₀** on the 46 m gauge's |u| tab and the steady **h** on its h tab.
3. Press **V**. The 46 m gauge jumps first, then the 30 m gauge, then the
   14 m one. Pause (space) and read the three arrival times in the inspector:
   the delay over 16 m should be 16/c.
4. Read **ΔH** on the 46 m gauge's flat top and compare with c·v₀/g. Let it
   run: the square wave has period 4L/c.
5. Press **V** to reopen, set **Slot celerity c = 35 m/s**, press **R** and
   wait about 20 s. Slam again: the delay doubles and the surge halves.

## For the instructor

Measured on Resolution Medium (563 × 169 cells, Δx = 0.107 m; 19 cells
across the bore) with `rig.js`, the app's frame loop paused so the 5 ms
record is uniform. Arrival = the first sample half-way up the expected rise;
ΔH = median of the 46 m gauge's first plateau; period = successive
up-crossings at the 46 m gauge. v₀ is the bore-mean u (19 points across the
bore at x = 22 and 38 m); the gauge's |u| reads the axis cell, a little
faster.

| reading | c = 70 m/s | c = 35 m/s |
|---|---|---|
| v₀, bore mean / 46 m gauge speed | 1.35 / 1.41 m/s | 1.30 / 1.32 m/s |
| steady h at 46 m | 15.79 m | 15.87 m |
| arrival at 46 / 30 / 14 m after V | 0.086 / 0.313 / 0.540 s | 0.164 / 0.602 / 1.041 s |
| Δt over 16 m (46→30, 30→14) | 0.227, 0.227 s | 0.439, 0.439 s |
| 16/c | 0.229 s | 0.457 s |
| ΔH at 46 m | 9.52 m | 4.77 m |
| c·v₀/g with bore v₀ / gauge v₀ | 9.63 / 10.07 m | 4.64 / 4.72 m |
| lowest h at 46 m (downsurge) | 5.76 m | 10.82 m |
| period | 2.77 s | 5.36 s |
| 4L/c, L = 46.75 m | 2.67 s | 5.34 s |

So the delay is 16/c to 1% (c = 70) and 4% (c = 35), and halving c doubles
it; ΔH is c·v₀/g to 1–3% with the bore-mean v₀ and 1–5% low with the
gauge's axis |u|, which is what students will use. The period at c = 70 runs
4% long: the reflection is not exactly at the mouth (the bellmouth and the
reservoir's own response add an end correction of about 1 m).

**Settle.** From rest the bore-mean velocity is within 2% of its final value
by about 15 s (1.33 m/s at 12 s, 1.35 m/s from 15 s on), when the tank has
filled to its overflow head; the h traces still ring by ±0.1–0.2 m at 20 s
from the start-up organ-pipe mode, which wave damping (0.03) takes slowly
out. The card waits **20 s** and the scene's own spin-up is the same.
After a change of c, R and the same 20 s re-settle it (the c = 35 row was
taken that way: c set at t = 0.9 s, slammed at 24 s).

**The outlet.** The hammer scene throttles the pipe with a nozzle that jets
out of the domain; here nothing throttles the bore. The tank's overflow
crest (z = 14.65 m) sets the tank level near 15.8 m, so the 0.2 m between
the reservoir and the tank drives about 1.35 m/s through 47 m of pipe. A
free discharge to air is not possible without a throttle: unthrottled,
v₀ ≈ √(2g·13) ≈ 16 m/s and c·v₀/g ≈ 110 m would cavitate the downsurge.

**Interface.** No build tools; MEASURE is the Gauge only; fields Water and
Pressure head; the panel is focused on Slot celerity c and the Gauge
inspector row. The corner gauge cards are withheld: stacked in the
bottom-right corner they cover the valve and the 46 m gauge. Open the three
inspector windows from Controls → Gauge inspector and park them in the
empty space above the pipe; each shows the full time series, live while the
simulation runs, with a tab for h and for |u|. Speed is ×0.1, so the 0.23 s
delay at c = 70 is 2.3 s of wall clock.

**Caveats.** The c slider runs well past the useful range: above about
c = 90 m/s the downsurge (≈ 15.8 − c·1.35/g) reaches zero pressure and the
column separates. At c much below 30 the slot's compression (f − 1 = g·d/c²,
0.15 at c = 30 under 14 m of water) starts to show as a visibly squashier
column. The 14 m gauge sits 9 m from the reservoir, so its high plateau
lasts only 2·9/c (0.26 s at c = 70) before the reflection arrives — enough
to time the arrival, not to read ΔH; read ΔH at 46 m.

### Discussion points

- **Pressure is not transmitted instantly.** The statics lecture says a
  pressure change is felt throughout a connected body of water; this is the
  footnote — it is felt after the time sound takes to cross it.
- **The surge does not depend on the pipe length,** only on c and v₀. The
  length sets how long the surge lasts (2L/c at the valve), which is why a
  valve closed in less than 2L/c counts as instantaneous.
- **Real numbers.** At c = 1200 m/s, stopping 1.4 m/s gives ΔH ≈ 170 m —
  seventeen atmospheres from shutting a tap quickly on a long main.
- **Why the low-pressure half matters.** After the reflection the head at the
  valve falls about as far below the static value as it first rose above it.
  Raise c until c·v₀/g approaches the static head (~13 m, so c ≈ 90 m/s here)
  and the downsurge reaches zero pressure: column separation.

`rig.js` is the console spot-check: `UP1.demo()` places the gauges, settles,
slams and prints the table above; `UP1.demo(35)` repeats it at c = 35 m/s.
