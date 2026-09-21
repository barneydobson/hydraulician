# UN-1 · Celerity and water-hammer reflections

A 49 m penstock runs from a reservoir 21 m above it to a valve at the far end.
The demonstrator slams the valve on the steady flow, measures the pressure
wave's celerity from its travel time between three gauges, and follows the
successive high- and low-pressure reflections with gauges, velocity rakes and
particles.

**Open it:** press **E** in the [app](https://barneydobson.github.io/hydraulician/)
and pick **UN-1**, or use the direct link
[`?ex=UN-1`](https://barneydobson.github.io/hydraulician/?ex=UN-1).
How to run any exercise: see the [teaching pack index](../INDEX.md#running-an-exercise).

## Theory

Shutting a valve on a moving column turns its momentum into pressure. The head
rise is Joukowsky's, and the wave then runs to the reservoir and back:

    ΔH = ΔV·c/g            T = 4L/c

c is the celerity — the speed of sound in that pipe, set by the water's
compressibility and the pipe's elasticity. Here the static head is **21.1 m**
(measured: reservoir surface above the pipe axis) and the penstock is
**L = 49 m**. For a complete valve closure, ΔV is the change from the steady
pipe velocity to the velocity behind the pressure front. In the ideal first
upsurge that is the whole initial velocity v₀.

For two gauges separated by Δx, the same wave front reaches them Δt apart:

    c = Δx/Δt

The three gauges below are 20 m apart, so the two independent travel-time
measurements can be compared. At the upstream reservoir the returning
pressure wave reflects with the opposite sign; the gauge traces therefore
make the high- and low-pressure passages visible as well as their speed.

## What to do

1. Choose the **Nozzle width** in Controls → Geometry, or leave its 0.40 m
   default. Changing it restarts the water; let the flow settle for about
   **15 s** before slamming the valve.
2. Put Gauges (`5`) on the pipe axis, **z = 3.5 m**, at **x = 10 m, 30 m and
   50 m**. Expand their cards with **⤢** so their head histories can be read
   clearly.
3. Put Rakes (`6`) at **x = 20 m and 40 m** and note the steady bore-mean
   **V₀**. Particles are already switched on. Each rake profile is scaled by
   the largest speed its section has experienced, so it stays visually stable
   while the fronts pass.
4. Press `V` to slam the valve and leave the simulation running. Identify the
   same first pressure rise at the 50 m, 30 m and 10 m gauges. Use each 20 m
   spacing and the difference between its two arrival times to calculate
   **c = 20/Δt**.
5. Pause after the first front has crossed a rake and note **V₁** there. Form
   **ΔV = |V₁ − V₀|**, then compare the measured gauge-head change with the
   Joukowsky prediction
   **ΔH = ΔV·c/g** (with g = 9.81 m/s²). The pressure rise should be close to
   this value; front smearing and the finite grid account for the remaining
   difference.
6. Keep watching after the first arrival. Talk through the high-pressure wave
   travelling towards the reservoir, its low-pressure reflection travelling
   back towards the valve, and the accompanying particle motion. Pause with
   **space** whenever a front needs a closer look.

### Discussion points

- **Measure before revealing.** The Slot celerity control's note line states
  the configured value and the corresponding Joukowsky rise per m/s. Keep the
  panel closed until the class has estimated c from the gauge timings.
- **Then change c.** Reset, set c = 140 m/s, let the flow settle and repeat the
  slam. The fronts cross each gauge spacing in half the time, the head rise is
  larger, and the reflection period halves. This is the experiment no
  physical rig can run: changing the pipe's effective elasticity while
  keeping its geometry in place.
- **Watch the particles, not just the pressure trace.** They distinguish the
  pressure wave's fast travel from the water's much slower motion and make the
  stopping and reversal behind successive fronts visible.
- **Use the rakes as section histories.** Their horizontal scale only updates
  when a section experiences a new maximum speed. A falling velocity therefore
  shortens against a fixed reference instead of making the whole profile
  rescale from frame to frame.

The full verification record — including the earlier nozzle-ladder celerity
exercise, the Joukowsky check at both celerities, settle-time evidence and
troubleshooting — is kept locally, out of version control, at
`exercises/UN-1-celerity/_archive/README-full.md`.
