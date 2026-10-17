# WV-5 · Group velocity: waves travel slower than their crests

A deep wave flume with a hinged flap at its left end. One press sends a
short train of waves down it: six waves, ramped up, held and ramped down.
The crests and the group part company at once. Each crest appears at the
back of the group, runs forward through it and dies away at its front,
because in deep water the group — and the wave energy with it — travels at
half the speed of the crests.

A showcase for the advanced end of the course (Showcase section of the
CIVE40008 menu), written for students to run themselves: no personalised
parameter, nothing to submit. The card is the whole exercise; these notes
are for the lecturer.

**Open it:** press **E** in the [app](../../../../)
and pick **WV-5**, or use the direct link
[`?ex=WV-5`](../../../../?ex=WV-5).
How to run any exercise: see the [course index](../../INDEX.md#running-an-exercise).

## Theory

Linear waves of frequency ω = 2π/T and wavenumber k = 2π/L in water of depth
h obey ω² = gk·tanh kh. A crest moves at the phase speed, the energy at the
group velocity:

    c_p = ω/k = L/T          c_g = dω/dk = n·c_p,   n = ½ (1 + 2kh / sinh 2kh)

In deep water (kh > π, h > L/2) n → ½: c_p = gT/2π and **c_g = c_p/2**. In
shallow water n → 1 and the two travel together. A wave train therefore
moves at c_g while its crests run through it at twice that speed: a crest
is born at the back of the group, where the paddle's energy has arrived,
and dies at the front, where it has not.

## The bench

| item | where |
|---|---|
| wavemaker | a flap hinged on the bed at the left end wall, stroke amplitude 0.095 m at the still-water level |
| train | six periods of T = 1.13 s: a 1.5-period cosine ramp up, three steady periods, a 1.5-period ramp down, then still; one train per press of **Wave train** on the strip or **V** |
| water | 0.80 m deep over a flat bed at z = 0.05 m; kh = 2.55 (tanh kh = 0.99) |
| absorber | the last 2 m: an extra viscosity ramped up towards the closed far wall, so nothing returns into the 8 m the train runs in |
| gauges | already placed at x = 2 m and 5 m, plotting the level η |
| sliders | **Wave period** and **Stroke** on the card (the Wavemaker panel's Period and Amplitude) |
| grid | Medium: 960 × 99 cells, Δx = 10.4 mm, over a 10.0 × 1.03 m box |

Linear theory for the card's wave: L = 1.97 m, c_p = 1.74 m/s,
c_g = 0.93 m/s, c_g/c_p = 0.53. Biésel's flap transfer function gives
H/S = 1.24, so the stroke would make H = 0.24 m; the grid delivers less
(below).

## What the class does

1. Press **Wave train** (or V). The flap rocks six times and stops; the
   train leaves it.
2. Follow one crest: born at the back of the group, overtaking, gone at the
   front. Pausing (space) helps.
3. Follow the group, where the waves are tallest: about half the crests'
   speed.
4. Time both on the two gauges, 3 m apart. The tallest waves pass the
   second gauge about 3.0 s after the first (c_g ≈ 1.0 m/s); a single
   crest takes about 1.6 s (c_p ≈ 1.9 m/s). The gauge charts show the
   train as a packet: its peak moves 3 m in twice the time a crest takes.
5. A longer period and fire again: longer waves, faster crests, a faster
   group. Speed on the colour key: the water moves only under the group,
   and not at all ahead of it.

The question to leave them with: where is the energy? With the group. A
crest ahead of the group has nothing behind it to keep it going.

## Measured

Headless, at the card's resolution, with the free surface read from the
fill fraction (Σf·Δx up each column, every T/20) at 0.1 m stations;
`rig.js` is the procedure. c_g is the envelope-peak arrival time fitted
against x over 1.5–6 m; c_p is ω over the wavenumber of the phase of the
paddle-frequency Fourier component along x.

| | c_p (m/s) | c_g (m/s) | c_g/c_p |
|---|---|---|---|
| linear theory, kh = 2.55 | 1.74 | 0.93 | 0.53 |
| the card: flap | 1.87 | 1.00 | **0.54** |
| a piston of equal H (stroke 0.063 m) | 1.87 | 1.03 | 0.55 |

Both speeds come out 7% above linear theory with the ratio right; the
crests run faster at this steepness (H/L ≈ 0.07, ka ≈ 0.22: Stokes's
amplitude dispersion adds 2–3%, the rest is the measurement over a decaying
train). At a smaller stroke on a similar grid (H ≈ 0.12 m, Δx = 11.4 mm) the measured ratio was
0.52 against 0.53, and at High (Δx = 9.3 mm, kh = 2.86) 0.52 against 0.52.

Wave height along the flume, envelope peak (twice the amplitude at the
paddle frequency), flap:

| x (m) | 0.5 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
|---|---|---|---|---|---|---|---|---|---|
| H (m) | 0.16 | 0.14 | 0.12 | 0.12 | 0.11 | 0.09 | 0.085 | 0.075 | 0.04 |

Water volume over the run: −0.009%.

**Flap or piston?** Biésel's transfer functions hold on the grid in ratio:
a flap and a piston make the same H from strokes 1.50 : 1 (theory 1.861/1.237
= 1.50). In deep water the flap is the cleaner wavemaker where it should
be, near the paddle: bed velocity range at x = 0.6 m, 0.06 m above the bed,
0.21 against 0.29 m/s for the piston (deep-water waves barely move the bed;
a piston pushes the whole depth), vertical velocity there 0.045 against
0.062 m/s, and the surface left at x = 1 m after the train has passed
moves 6 mm against 21 mm. A wavelength out the two are the same wave.

## Why these numbers

The grid damps short waves (engineering notes, "Surface waves are damped by
RESOLUTION" and "Deep-water waves are the worst case"). The first draft —
T = 0.8 s, L = 1 m, 0.5 m of water, Low — lost its wave within one
wavelength of the flap. Measured on that geometry, a deep-water wave lasted
about 1, 2, 2.5 and 3.5 wavelengths at 73, 106, 145 and 204 cells per
wavelength, and dies quickly once its height is below ~4 cells. So the card
uses the longest wave a Medium grid can hold several of, and makes it
steepish: L ≈ 2 m (190 cells), H ≈ 0.14 m (13 cells), with the depth cut to
kh = 2.55 rather than π to keep the box short (c_g/c_p 0.53 instead of
0.52). Even so the group fades along the flume (the table above): say so to
the class — real waves of this size would run the length of a lab flume
almost undiminished.

**Speed.** About 0.3–0.45× real time on a desktop GPU (960 × 99 cells,
Δt = 2.3e-4 s): a train takes about 12 s of simulated time to cross the
flume, half a minute to watch. Pausing on a frame and stepping on is the
better way to follow one crest.

The five other numbers in the scene (c = 14, cs, cf, ca, bulk) are WV-4's
and do not move the result: H along the flume changed by under 5% between
c = 14 and 16, and `kappa: 0` (the mixing length off) let the wave go a
little further but filled the flume with grid-scale surface noise.
