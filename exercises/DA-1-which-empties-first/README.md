# DA-1 · Which tank empties first?

## Lecturer notes

A five-minute lecturer demo of Froude scaling, and of what breaks it. A 4 m
tank stands beside an exact half-scale copy of itself, both full to the same
relative depth, each draining through a slot in its floor. It runs twice:

1. **In water.** The half-scale tank empties in √½ ≈ 0.71 of the
   prototype's time, as Froude scaling predicts.
2. **In syrup.** Same tanks, same prediction, and the model is 17% slow.
   Viscosity is the force the model does not scale.

Before the first run, the class votes on whether the small tank empties in:

- the same time;
- 0.71 (√½) of the time;
- half the time;
- a quarter of the time.

**Open it:** press **E** in the [app](https://barneydobson.github.io/hydraulician/)
and pick **DA-1**, or use the direct link
[`?ex=DA-1`](https://barneydobson.github.io/hydraulician/?ex=DA-1).
How to run any exercise: see the [teaching pack index](../INDEX.md#running-an-exercise).
It runs on the `fluid-tanks` scene; the card sets everything up.

## The rig

The `fluid-tanks` scene is an 8.75 m × 4.0 m slice, per metre width.

| | prototype (left) | model (right), L_r = ½ |
|---|---|---|
| outer left edge | x = 0.2 m | x = 5.2 m |
| clear width | 4.0 m | 2.0 m |
| slot in the floor, a | 0.40 m | 0.20 m |
| fill depth above the floor | 2.8 m | 1.4 m |
| gauge station | x = 1.6 m | x = 5.9 m |

Controls → Geometry has two sliders:

- **Length ratio L_r** (default ½) resizes the model.
- **Fluid** switches BOTH tanks between water (ν = 10⁻⁶ m²/s) and a thick
  syrup (ν = 0.03 m²/s, 30 000 times water). Changing either refills both
  tanks.

Gauges on **Depth d** read the depth above each tank's own floor.

## Running it

1. Open DA-1. Both tanks are full of water and the slots are shut.
2. Take the vote.
3. Place two Depth gauges (`5`): prototype at x = 1.6 m, model at x = 5.9 m.
4. Press **V**. Expand both gauge cards (⤢) and hover the traces:
   - the prototype falls from d = 2.50 m to 1.00 m in **4.10 s**;
   - the model falls from 1.25 m to 0.50 m (the same marks × ½) in **2.86 s**.
5. Set **Fluid** to syrup. Both tanks refill. Press **V** again and read the
   same marks:
   - the prototype takes **3.98 s**;
   - the model takes **3.28 s**.

## Recalculating the scaling in both cases

### Water: Froude scaling

Every length scales by L_r. With gravity and inertia the forces that
matter, velocities scale as √L_r (V ∼ √(gd), Torricelli or Froude), and a
time is a length over a velocity:

    V_r = √L_r,     T_r = L_r / V_r = L_r / √L_r = √L_r

So the predicted model time is √L_r times the MEASURED prototype time:

    T_m = √L_r · T_p = 0.707 × 4.105 s = 2.90 s        measured 2.86 s   (−1.5%)

### Syrup: the same prediction, recalculated

Froude's rule does not care what the fluid is, so it predicts √L_r times
the prototype's time in syrup:

    T_m = √L_r · T_p = 0.707 × 3.975 s = 2.81 s        measured 3.28 s   (+17%)

The model is 0.47 s slow. Froude assumed viscosity is negligible, and in
syrup it is not.

### Why: the Reynolds numbers

Add ν to the variable list and the drain time depends on a second group:

    T √(g/L) = φ(Re),    Re = V a / ν

Froude scaling works while Re is high enough in BOTH tanks that φ no longer
depends on it. Take the jet velocity through the slot at mid-window
(d ≈ 1.75 m in the prototype, 0.875 m in the model), V = √(2gd):

| | V (m/s) | a (m) | Re in water | Re in syrup |
|---|---:|---:|---:|---:|
| prototype | 5.86 | 0.40 | 2.3 × 10⁶ | 78 |
| model (L_r = ½) | 4.14 | 0.20 | 8.3 × 10⁵ | 28 |

With the same fluid in both tanks, Re_r = V_r L_r = √L_r · L_r = L_r^1.5
(0.35 here), so the model's Re is always the smaller. In water both are in
the hundreds of thousands and the difference does not matter. In syrup the
prototype, at Re ≈ 80, drains only 3% slower than in water, while the model,
at Re ≈ 30, has crossed into the range where viscosity controls the flow.

### The other limit: fully viscous scaling

If viscosity dominated completely, inertia would drop out instead of
viscosity. A creeping flow through the slot has V ∼ g d a² / (ν × floor
thickness), and every one of those lengths scales by L_r, so with the same
fluid:

    V_r = L_r · L_r² / L_r = L_r²,     T_r = L_r / V_r = 1 / L_r = 2

A fully viscous half-scale model would take TWICE as long as the prototype.
The measured syrup ratio, 3.28 / 3.975 = 0.83, sits between Froude's 0.71
and that viscous 2, closer to Froude: the syrup model is in transition,
which is where a small real model in water ends up too.

### What would restore similarity?

Match Re as well as Fr: Re_r = L_r^1.5 / ν_r = 1, so the model needs a
fluid with ν_m = L_r^1.5 · ν_p = 0.35 × 0.03 = 0.011 m²/s: a THINNER syrup in
the smaller tank. Real laboratories rarely can (with water in the prototype
the model would need a fluid 3 times less viscous than water), which is why
they keep models large enough that Re stays high. This scene puts one fluid
in both tanks, so it cannot show the fix, only the problem.

## Discussion points

- **Nobody got a quarter.** A Froude model runs slow in water: a 1:25 model
  of a 2-hour drain takes 24 minutes, not 5.
- **Syrup at L_r = ¼** (move the slider) breaks much harder, because the
  model's Re falls as L_r^1.5. The quarter-scale model now takes LONGER than
  the prototype: 4.73 s against 3.98 s, a ratio of 1.19 where Froude says
  0.5. It is heading for the fully viscous 1/L_r = 4.
- **This is the complete-turbulence rule.** A model must keep Re in the
  range where the coefficient (C_d here, λ on the Moody diagram) has stopped
  depending on it.

## Console spot-check

Paste [rig.js](rig.js) into the console and run `await DA1.run(0)` (water)
or `await DA1.run(1)` (syrup). Measured on the card's settings:

| fluid | ν (m²/s) | T_p (s) | T_m (s) | T_m / T_p | vs √½ = 0.707 |
|---|---:|---:|---:|---:|---:|
| water | 10⁻⁶ | 4.105 | 2.860 | 0.697 | −1.5% |
| syrup | 0.03 | 3.975 | 3.281 | 0.825 | +16.7% |

The syrup viscosity was chosen so that only the smaller tank breaks: at
ν = 0.01 the half-scale model still follows Froude (−0.8%); at ν = 0.1 the
prototype slows too.
