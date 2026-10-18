# WV-5 · Group velocity: waves travel slower than their crests

A wave flume with a hinged flap at its left end. One press sends a short
train of waves down it: eight waves, ramped up, held and ramped down. The
crests and the group part company at once. Each crest appears at the back
of the group, runs forward through it and dies away at its front, because
the group — and the wave energy with it — travels at about 0.6 of the
speed of the crests here (half of it in deep water).

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
moves at c_g while its crests run through it faster: a crest is born at the
back of the group, where the paddle's energy has arrived, and dies at the
front, where it has not.

## The bench

| item | where |
|---|---|
| wavemaker | a flap hinged on the bed at the left end wall, stroke amplitude 0.05 m at the still-water level (card: **Stroke**) |
| train | eight periods of T = 1.1 s: a 2-period cosine ramp up, four steady periods, a 2-period ramp down, then still; one train per press of **Wave train** on the strip or **V** |
| re-running | every press resets the flume to still water and t = 0 first (the gauges' charts restart with it), then fires — pressing again is how the experiment is repeated, and it cannot be fired into the leftovers of the last one |
| water | 0.50 m deep over a flat bed at z = 0.02 m; kh = 1.76 |
| absorber | the last 2 m (9–11 m): an extra viscosity ramped up towards the closed far wall, so nothing returns into the 9 m the train runs in |
| gauges | already placed at x = 2 m and 6 m, plotting the level η |
| sliders | **Wave period** and **Stroke** on the card (the Wavemaker panel's Period and Amplitude) |
| grid | High: 1762 × 99 cells, Δx = 6.2 mm, over an 11.0 × 0.62 m box |

Linear theory for the card's wave: L = 1.78 m, c_p = 1.62 m/s,
c_g = 0.98 m/s, c_g/c_p = 0.60. Biésel's flap transfer function gives
H/S = 0.94, so the stroke would make H = 0.094 m; the grid delivers
0.07–0.09 m near the flap. With eight periods and c_g/c_p = 0.6 the group
holds about five crests at once (8 × 0.6).

## What the class does

1. Press **Wave train** (or V). The flap rocks eight times and stops; the
   train leaves it. Every press starts again from still water.
2. Follow one crest: born at the back of the group, overtaking, gone at the
   front. Pausing (space) helps.
3. Follow the group, where the waves are tallest: about 0.6 of the crests'
   speed, all the way into the absorber at 9 m.
4. Time both on the two gauges, 4 m apart. A single crest takes about
   2.3–2.5 s (c_p ≈ 1.6–1.75 m/s); the tallest waves of the group take
   about 4 s (c_g ≈ 1.0–1.1 m/s, measured below), so the ratio is about
   0.6. The gauge charts show the train as a packet.
5. A longer period and fire again: longer waves, faster crests, a faster
   group, and a ratio closer to 1 (shallower water for that wave). Speed on
   the colour key: the water moves only under the group.

The question to leave them with: where is the energy? With the group. A
crest ahead of the group has nothing behind it to keep it going.

## Measured

Headless, at the card's resolution, with the free surface read from the
fill fraction (Σf·Δx up each column, every T/20) at 0.1 m stations;
`rig.js` is the procedure. H is twice the largest one-period Fourier
amplitude at the paddle frequency at each station. c_g is the
envelope-peak arrival time (the centroid of the envelope above 60% of its
maximum) fitted against x; c_p is ω over the wavenumber of the phase of the
paddle-frequency component along x.

| | c_p (m/s) | c_g (m/s) | c_g/c_p |
|---|---|---|---|
| linear theory, kh = 1.76 | 1.62 | 0.98 | 0.60 |
| the card, fitted over 1.5–6 / 1.5–7 / 2–8 m | 1.74–1.78 | 1.07–1.10 | **0.60–0.63** |

Both speeds come out 7–9% above linear theory with the ratio right: the
crests are steep near the flap (H/L ≈ 0.05; Stokes's amplitude dispersion
adds a few per cent) and the grid's surface noise (below) adds scatter.

**Wave height along the flume** (the headline complaint of round 1 was that
the waves "don't even make it to the end of the tank"), H in m:

| x (m) | 0.5 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 (absorber) |
|---|---|---|---|---|---|---|---|---|---|---|
| round 1 (0.8 m deep, T 1.13 s, Medium, default closure), stroke 0.095 | 0.16 | 0.14 | 0.12 | 0.12 | 0.11 | 0.09 | 0.085 | 0.075 | 0.04 | — |
| round 1 scene at the new stroke 0.05 | 0.10 | 0.09 | 0.08 | 0.06 | 0.04 | 0.025 | 0.012 | 0.004 | 0 | — |
| **the card** (0.5 m, T 1.1 s, High, kappa 0, ca 0.2, ν 1e-4) | 0.086 | 0.088 | 0.066 | 0.069 | 0.073 | 0.066 | 0.068 | 0.064 | 0.056 | 0.053 |
| the clean alternative, ν 3e-4 | 0.074 | 0.071 | 0.070 | 0.063 | 0.051 | 0.041 | 0.035 | 0.026 | 0.016 | 0.012 |

Water volume is conserved by construction (the flap's volume flux is held
over the live depth; engineering notes, "Two wavemakers").

## Viscosities

The lecturer asked for every viscosity in the scene as small as it will go
while the run stays stable and free of grid noise. Measured on this flume
(T = 1.0–1.1 s, 0.05 m stroke), one damper at a time:

| knob | tried | effect |
|---|---|---|
| `kappa` (mixing length, issue #77) | 0.41 (default), 0.1, 0 | the main damper: at 0.41 the train was gone by x ≈ 5 m at Medium and at High; at 0.1 H at 4 m doubled; **0** (off) a little further again. A wave flume has no channel shear for the closure to model |
| `ca` (interface compression) | 0.8, 0.4, 0.3, 0.2, 0 | the second damper, hidden in the old notes because the closure was on: with kappa 0.1 at Medium, ca 0.8 → 0 took H at 7 m from 0.011 to 0.044 m. ca 0 smears the interface and traps air (columns of missing water behind the train); **0.2** keeps the gain without that; 0.4 reached slightly less far than 0.2 |
| `nu` (laminar) | 5e-5, 1e-4, 1.5e-4, 2e-4, 3e-4, 1e-3 | with the closure off this is the knob that trades reach against noise. Not through the bulk 2νk² (0.007 /s at 3e-4 — nothing): a uniform ν acts on the shear layer the void treatment leaves at the surface. **1e-4** carries the train into the absorber at 0.05 m but leaves cell-sized spikes and slowly drifting air holes on the surface behind it and roughens the crests; 1.5e-4 and 2e-4 fewer; 3e-4 none at all, but the group is then down to 0.016 m by 8 m and the flume looks empty when it should arrive; 1e-3 kills the train by 6 m |
| `cs` (Smagorinsky) | 0, 0.08, 0.2, 0.3 | 0 (with bulk 0.01) left the water behind the train rougher and carried it no further; 0.2–0.3 cleaned the surface but damped the train like ν = 3e-4. **0.08** kept |
| `bulk` (acoustic damping) | 0.01, 0.03 | no measurable effect on the train; **0.03** kept |
| resolution | Medium (9.4 mm), High (6.2 mm), Very high (4.7 mm) | with the same keys Medium loses the train by 6–7 m; Very high (tried with kappa 0.1, ca 0.8) carried it further still but ran at a quarter of High's speed. **High** |

The card ships **kappa 0, ca 0.2, ν 1e-4, cs 0.08, bulk 0.03, High**:
reach first, because the train not reaching the end was the complaint. ν
3e-4 is the clean alternative (one number in the scene, `nu`), at the cost
of the last third of the flume. The remaining damping and the noise both
live in the free-surface treatment (the void's velocity bleed and the
surface shear layer, engineering notes "The surface is stress-free"), not
in any scene key; that is a shader question.

**Flap or piston?** Round 1 measured it on the 0.8 m flume: Biésel's
transfer functions hold on the grid in ratio (a flap and a piston make the
same H from strokes 1.50 : 1, theory 1.50), and in deep water the flap is
the cleaner wavemaker near the paddle. Here (kh = 1.76) Biésel's ratio is
0.94 : 1.56; `rig.js` runs either.

## Speed

High is 1762 × 99 cells at Δt = 1.76e-4 s (acoustic, c = 10; the absorber's
0.03 m²/s was chosen so it does not set the step): about 0.15–0.2 simulated
seconds per wall second headless on the development GPU, drawing every
frame. A train takes about 13 s of simulated time to reach the absorber —
about a minute and a half to watch on that machine, faster on a good
desktop GPU. Pausing on a frame and stepping on is the better way to follow
one crest. c = 10 rather than 14 is 1.25× faster; gd/c² = 5% at the bed.
