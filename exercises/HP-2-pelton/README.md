# HP-2 · The Pelton principle without the wheel

A spout fires a free jet across open air onto a drawn flat plate, then onto a
deep, narrow V-splitter approximating θ → 165° — as close as this tool gets to
a Pelton bucket without an actual rotating wheel. There is none, and it is not
needed: the whole Pelton argument is a control volume, and the factor of two a
bucket collects over a flat plate is something the class can watch happen
rather than be told. Velocity triangles and u/v₁ = ½ stay on the slides; this
rig's job is to make ρQΔv visceral.

**Open it:** press **E** in the [app](https://barneydobson.github.io/hydraulician/)
and pick **HP-2**, or use the direct link
[`?ex=HP-2`](https://barneydobson.github.io/hydraulician/?ex=HP-2).
How to run any exercise: see the [teaching pack index](../INDEX.md#running-an-exercise).

## Theory

A vane that turns a jet through θ takes the whole change in momentum flux:

    F = ρ·q·v·(1 − cos θ)        stagnation head = v²/2g

A flat plate turns the jet through 90°, so 1 − cos θ = 1. A Pelton bucket
turns it back on itself, θ → 180°, and collects twice as much from the same
jet. Measured on this rig: the coherent core carries **q ≈ 0.78 m²/s** at
**v ≈ 4.46 m/s**, and the deep V's arms sit at γ = 15° off the jet axis, i.e.
**θ = 165°** (measured turn 160–165°, so the design angle is delivered).

| shape | θ | 1 − cos θ | F (N per metre of width) |
|---|---|---|---|
| flat plate | 90° | 1.000 | **3 480** |
| deep V (this rig) | 165° | 1.966 | **6 841** |
| *Pelton ideal* | *180°* | *2.000* | *6 958* |

## What to do

This one is a lecturer demonstration — nothing is submitted, and the
arithmetic goes on the board. It runs at real time or faster, in about 8 min.

1. The rig arrives on the **flat plate**, with the Field already on Speed.
   Hover the jet at a clear station a little upstream of the plate: the box's
   **u** — the horizontal component — is the jet velocity v of the formula,
   ≈4.5 m/s here. Note how coherent the jet still is after its flight.
2. Switch **Field → Momentum flux**: the incoming jet reads red (forward),
   the splash turns white and blue (reversed). The colour is normalised
   against the frame's own maximum, so it is an honest sign, not a
   speedometer.
3. Erase (`2`) the plate and redraw it as the deep V with Wall (`1`) — apex
   at (1.60, 2.45), two 0.9 m arms at 15° either side of the jet axis, plus
   one short capping stroke across the apex, because two arms sharing a drawn
   endpoint do not seal. Press `R` and let it settle — about **5 s**; the card
   counts it down. Both arms now run blue.
4. Do the arithmetic: same jet, same q and v, F goes from ≈3 480 to
   ≈6 840 N/m — the factor of two a bucket collects, in three numbers the
   class watched happen.

![momentum flux, flat plate: red jet, splash turning white and blue](shots/05-flat-momentum-flux.png)

![momentum flux, deep V: strong reversal along both arms](shots/03-deepV-momentum-flux.png)

**If you want the head as well as the force**, put a gauge in the free jet and
another on the stagnation point (MO-2's two stations). Expect the ratio to
read **1.15–1.30, not 1**, and say why: the jet keeps accelerating under
gravity over its last stretch of flight, and the solver's compressible
equation of state adds a stagnation response scaling with M = v/c ≈ 0.20.
Read gauges, not the raw hover box, for any head comparison — the gauge adds
the elevation back.

**Sibling demo MO-2** (`exercises/MO-2-jet-vane/`) runs the full turning
series — flat, 45°, 90°, deep V — on this same rig, and carries the poolable
stagnation-ratio submission if a class wants a number to hand in.

The full verification record — jet coherence and droop, the measured turn
angle, the two build traps behind the V's geometry, and why no rotating wheel
is reachable in this solver — is kept locally, out of version control, at
`exercises/HP-2-pelton/_archive/README-full.md`.
