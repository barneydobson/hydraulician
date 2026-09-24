# DA-1 · Which tank empties first?

## Lecturer notes

A two-minute lecturer demo of the Froude time scale. A 4 m tank stands beside
an exact quarter-scale copy of itself. Both are full to the same relative
depth, and each drains through a slot in its floor. Before anything runs,
the class votes on whether the small tank empties in:

- the same time;
- a quarter of the time;
- half the time;
- a sixteenth of the time.

Then V opens both slots at the same instant. The small tank wins, but only
by about half, not a quarter. That is T_r = √L_r, seen rather than derived.

**Open it:** press **E** in the [app](https://barneydobson.github.io/hydraulician/)
and pick **DA-1**, or use the direct link
[`?ex=DA-1`](https://barneydobson.github.io/hydraulician/?ex=DA-1).
How to run any exercise: see the [teaching pack index](../INDEX.md#running-an-exercise).
It runs on the `scale-tanks` scene, which boots at λ = ¼, and is the lecturer
half of [DA-2](../DA-2-time-scales/), where every student repeats it at
their own λ. The rig and its dimensions are described there.

## Running it

1. Open DA-1. Both tanks are full and the slots are shut. The clock can run
   while you talk; nothing moves.
2. Take the vote. Put the four options on the board and make people commit.
3. Place two gauges (`5`, the card's Gauges plot is already on **Depth d**):
   - the prototype at x = 1.6 m;
   - the model at x = 5.55 m, which is the same station scaled by ¼.

   Any height below the water works.
4. Press **V**. At Speed ×1 the model is visibly empty while the prototype is
   still at about half depth. The whole prototype drain takes about 10 s of
   simulated time. Slow it down with the Speed slider if the room needs longer.
5. Expand both gauge cards (⤢) and hover the traces:
   - the prototype falls from d = 2.50 m to 1.00 m in **4.06 s**;
   - the model falls from 0.625 m to 0.25 m (the same marks × ¼) in **1.84 s**.

   The ratio is 0.45.

## Why ½

Every length scales by λ, so velocities scale by √λ (V ∼ √(gh), Torricelli
or Froude, whichever the class prefers), and times by length ÷ velocity:

    T_r = L_r / V_r = λ / √λ = √λ = ½ at λ = ¼

The same argument gives the discharge per metre width as q_r = V_r·L_r =
λ^1.5 = ⅛. The small tank holds 1/16 of the water and releases it at ⅛ of
the rate, so it empties in (1/16)/(1/8) = ½ of the time. Per metre width, in
this vertical slice, "holds" means area: B·h scales as λ².

## What the measured 0.45 is

The simulation gives 0.454, not 0.500. The small tank drains about 9%
faster than Froude predicts, which is a scale effect. This solver's
effective viscosity is tied to the grid, and the grid does not shrink with
the model: the quarter-scale slot is 5 cells wide against the prototype's 20.
DA-2 measures the effect across λ = 0.25–0.70 and shows it vanishing towards
λ = 1. For the demo, "about half, and certainly not a quarter" is the point;
the 9% is a good question to leave the room with.

## Console spot-check

Paste [DA-2's rig.js](../DA-2-time-scales/rig.js) and then [rig.js](rig.js)
into the console and run `await DA1.run()`. It returns T_p = 4.056 s,
T_m = 1.840 s, ratio 0.454.
