# HP-2 · The Pelton principle without the wheel

A spout fires a free jet at a drawn deflector, and a control-volume **Force
box** reads the horizontal force on whatever it encloses. Three deflectors
against the same jet: a flat plate (about 4 kN/m), a Pelton-style cup that
turns the jet through ~165° (about 7 kN/m — close to the factor of two), and
the deep-V of the textbook figure, which floods and reads only about 5.

**Open it:** press **E** in the [app](https://barneydobson.github.io/hydraulician/)
and pick **HP-2**, or use the direct link
[`?ex=HP-2`](https://barneydobson.github.io/hydraulician/?ex=HP-2).
How to run any exercise: see the [teaching pack index](../INDEX.md#running-an-exercise).

## Theory

A vane that turns a jet through θ takes the whole change in momentum flux:

    F = ρ·q·v·(1 − cos θ)        per metre of width

The Force box (tool `9`) evaluates the momentum theorem on the box you drag —
the flux and pressure integral over its faces, time-averaged. F→ is the
number to read; gravity never enters the horizontal budget. Moving the box
does not change the reading, as long as it still encloses the whole deflector
and not the spout.

Measured where the jet crosses the box's upstream face: **q ≈ 0.78 m²/s** at
**v ≈ 4.4 m/s**, so ρqv ≈ 3.5 kN/m.

| deflector | θ | 1 − cos θ | ρqv(1−cosθ) | F→ measured |
|---|---|---|---|---|
| flat plate | 90° | 1.00 | 3.5 kN/m | ≈4 |
| cup (below) | ~168° | 1.98 | 6.9 kN/m | ≈7 |
| deep-V | 165° | 1.97 | 6.9 kN/m | ≈5 |

## What to do

Lecturer demonstration, ~10 min. The card counts each settle down.

1. Pick the **Force box** tool (`9`) and drag a box from **(0.85, 1.55) to
   (2.05, 3.20)** around the flat plate: **F→ ≈ 4 kN/m**. Drag a different
   box around the same plate — the reading holds. Keep the upstream face
   right of x ≈ 0.8: a box that contains the spout contains a source, and
   its reading is not a force.
2. Hover the jet just inside the upstream face: u ≈ 4.4 m/s, so ρqv ≈ 3.5
   kN/m. The plate reads about 20% more because deflected water rains back
   onto the jet and is driven in a second time — switch **Field → Momentum
   flux** to see it.
3. Erase (`2`) the plate and draw the cup with Wall (`1`) — six strokes:

   | from | to |
   |---|---|
   | (1.10, 2.65) | (1.30, 2.60) |
   | (1.30, 2.60) | (1.40, 2.40) |
   | (1.40, 2.40) | (1.45, 2.20) |
   | (1.45, 2.20) | (1.35, 2.05) |
   | (1.35, 2.05) | (1.15, 1.95) |
   | (1.15, 1.95) | (1.00, 1.90) |

   Nearest-5-cm accuracy is plenty — the cup is tolerant of hand-drawing.

   This is one half of a Pelton bucket in section: the jet wraps the inside
   of the cup and leaves down-and-back, so gravity clears the spent water
   under the spout. Press `R`, let it settle: **F→ ≈ 7 kN/m — about 1.7× the
   plate** — and the force arrow lengthens to match.
4. Hover the exit sheet where it crosses the box face: about 5.5 m/s, heading
   down-and-back — faster than it arrived, because the jet fell ~0.5 m
   through the cup. On the board: ρq(v_in + v_out·cos θ) ≈
   0.78 × (4.4 + 5.5×0.9) ≈ 7 kN/m — the box's number.
5. Optional: draw the textbook deep-V — apex **(1.90, 2.40)**, two arms about
   15° either side of the jet axis out to (1.05, 2.65) and (1.05, 2.15),
   plus one short capping stroke across the apex (butt-ended arms meeting at
   a point do not seal). θ = 165° promises 1.97 × ρqv; the box reads only
   **about 5 kN/m**. A wedge this deep cannot drain in the vertical plane:
   it floods (F↑ shows it holding standing water) and the return is a slow
   spill. This is why real buckets turn the water downward and notch the lip.

![flat plate: force box reading about 4 kN/m](shots/06-plate-forcebox.png)

![cup: jet in, sheet out down-back, force box about 7 kN/m](shots/07-cup-forcebox.png)

![deep-V: flooded wedge, force box about 5 kN/m](shots/08-deepV-forcebox.png)

**Heads, if you want them:** gauges in the free jet and on the stagnation
point (MO-2's two stations) read a ratio of 1.15–1.30 × v²/2g, not 1 — the
jet accelerates under gravity over its last stretch of flight, and the
equation of state adds a response at M = v/c ≈ 0.2. The plate's +20% above
ρqv is the same kind of gap.

**Sibling demo MO-2** (`exercises/MO-2-jet-vane/`) runs the turning series —
flat, 45°, 90°, deep-V — on this rig, with the momentum-flux colours carrying
the direction story and a poolable stagnation-ratio submission.

The full verification record (box-independence, mass closure, the wall-pressure
cross-check, the cup design trail) is kept locally, out of version control, at
`exercises/HP-2-pelton/_archive/README-full.md`.
