# HP-3 · Hydropower and unsteady flow: test the tutorial predictions

HP-3 is the simulation half of the hydropower and unsteady-flow tutorial.
Students first calculate the steady penstock quantities and the first surge
crest for one fixed scheme, then use the app to fill the measured column beside
their predictions. This is no longer a student-number shaft-width sweep: leave
the geometry at the sheet values, let the 60 s settle finish, and compare like
with like.

**Open it:** press **E** in the [app](https://barneydobson.github.io/hydraulician/)
and pick **HP-3**, or use the direct link
[`?ex=HP-3`](https://barneydobson.github.io/hydraulician/?ex=HP-3).
How to run any exercise: see the [teaching pack index](../INDEX.md#running-an-exercise).
The student handout is
[`tutorial-sheet-questions.docx`](tutorial-sheet-questions.docx). The tutor copy,
[`tutorial-sheet.docx`](tutorial-sheet.docx), includes the worked answers;
`tutorial-sheet.py` regenerates it from the same constants.

## The fixed scheme

The exercise opens at Resolution Medium with the tutorial geometry already set:

| quantity | value |
|---|---:|
| reservoir surface | 24.9 m above datum |
| headrace length, L | 42.4 m |
| headrace depth, D_h | 3.05 m |
| surge-shaft width, D_s | 3.0 m |
| penstock depth, D_p | 2.4 m |
| penstock length, L_p | approximately 20 m |
| nozzle width | 0.48 m |
| nozzle elevation | 3.0 m above datum |
| discharge, q₀ | 7.6 m²/s per metre width |
| Darcy friction factor, λ | 0.03 |

The app's nominal geometry sliders say 25.0 m, 3.0 m and 42 m where the
calculation uses the measured free surface and rasterised dimensions above.
Those measured values are the ones on the tutorial sheet. The HP-3 interface
therefore hides the geometry sliders, exposes the Gauge and Rake tools, and
leaves only the **Gauges plot** selector in Controls. That selector changes from
Level η to Depth d. **⋯ Show everything** remains available for an extension,
but changing a geometry control makes a different experiment.

## Calculation before the session

The conduits are slots of unit width, so area is their depth and the hydraulic
diameter in Darcy–Weisbach is 2D. For the headrace,

    V₀ = q₀/D_h
    h_f = λ·(L/2D_h)·V₀²/2g

From the reservoir surface to the atmospheric jet,

    V_jet = √[2g(H − h_f,total)]
    P = ρgq₀(H − h_f,total) = ½ρq₀V_jet²

where H = 24.9 − 3.0 = 21.9 m and the total loss includes the headrace and
penstock. Because h_f ∝ q², maximum transmitted power occurs at h_f = H/3.

For the shutdown, η is the shaft level relative to the reservoir surface,
positive upwards. The steady running level is

    η₀ = −(V₀²/2g + h_f) = −kV₀²

and the first crest is the positive root of

    η_max = Y·[1 − exp((η₀ − η_max)/Y)]
    Y = L·D_h/(2gkD_s)

The sheet's predicted column is:

| quantity | prediction |
|---|---:|
| V₀ | 2.49 m/s |
| h_f along the headrace | 0.066 m |
| V_jet | 20.7 m/s |
| P | 1.62 MW/m |
| q* for maximum P | 57 m²/s |
| η₀ | −0.38 m |
| k | 0.0616 s²/m |
| Y | 35.7 m |
| η_max | 4.97 m |

## In the app

1. Let the exercise's **60 s** settle finish. Do not move a geometry slider.
   Use the **Rake** tool at **x = 27 m** through the headrace and read the
   rake's depth-averaged **V** as V₀. This is the conduit mean q/D required by
   the sheet, rather than a point velocity from one cell. Hover the horizontal
   jet just past the nozzle near **x = 66 m, z = 3 m** and read its u component
   as V_jet; w is nearly zero there.
2. Leave **Gauges plot** on **Level η**. Place one gauge in the reservoir by
   the wall at **x = 6.6 m, z = 20 m** and one in the shaft at
   **x = 50 m, z = 18 m**. Read the centre of each settled trace over about ten
   seconds, then calculate

       η₀ = η_shaft − η_reservoir
       h_f = −η₀ − V₀²/2g
       k = −η₀/V₀²

   The first h_f expression is the simulation comparison for the worksheet's
   headrace loss. A direct HGL fit over x = 24–44 m gives the tutor value below.
3. Calculate the measured power from the measured jet speed,
   **P = ½ρq₀V_jet²**.
4. Change **Gauges plot** to **Depth d**, press **V** once to close the turbine,
   and expand the shaft gauge (⤢). Read its level immediately before closure,
   d₀, and its first crest, d_max. Then

       rise = d_max − d₀
       η_max = rise + η₀

5. Fill the measured column for V₀, h_f, V_jet, P, η₀, k and η_max.
   For another run press **R**, wait out the full settle again, then press V.

Read η₀ on **Level η**, not on h: the open shaft surface is the level the
calculation defines, while pressure head part-way down the slowly circulating
column is noisier and biased. Read the crest on **Depth d**: under the crest the
shaft water is decelerating, so a submerged h gauge can read about a metre low.
The d trace moves in whole cells (about 0.16 m at Medium); take the highest step.

![the D_s = 3 m run](plots/surge-trace-Ds3.png)

## Tutor check

One verified Medium run, settled for 60 s before shutdown, gives:

| quantity | sheet | app |
|---|---:|---:|
| V₀ | 2.49 m/s | 2.51 m/s |
| h_f along the headrace | 0.066 m | 0.068 m |
| V_jet | 20.7 m/s | 20.6 m/s |
| P | 1.62 MW/m | 1.62 MW/m |
| η₀ | −0.38 m | −0.38 ± 0.02 m |
| k | 0.0616 s²/m | 0.0602 s²/m |
| η_max | 4.97 m | 4.95 m |

The app h_f is a 60 s least-squares HGL fit over x = 24–44 m, clear of the
entry recovery; its slope is 1.61×10⁻³ and gives λ = 0.030. The simpler
student calculation from −η₀ − V₀²/2g is more sensitive to the shaft's
cell-sized level steps, so a result around 0.06–0.07 m is the expected agreement.

The sheet asks for q* as a calculation, not an app measurement. The delivered
nozzle range keeps V_jet close to √(2gH) and cannot reach h_f = H/3; HP-1 is the
separate maximum-power experiment with enough throttling to turn that curve
over.

## Optional extension

The earlier class-width sweep remains available to an instructor after
**⋯ Show everything**: vary D_s, reset and re-settle each run, and compare the
crest with the rigid-column prediction. `rig.js` automates that verification,
and `collect_plot.py` still pools rows of
`student_id,digit,Ds_m,u0_ms,z0_m,rise_m,T_s`. It is an extension, not part of
the revised tutorial sheet or the default HP-3 controls.
