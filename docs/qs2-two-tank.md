# QS-2 · Two tanks and two parallel mains

This note checks the original circular-tank problem. The implemented
[revised 2D exercise](../exercises/QS-2-twin-tanks/README.md) uses larger
rectangular tanks, identical straight ducts, and a measured 2D resistance.

## Problem and reference solution

Two cylindrical tanks have diameters 3 m and 2 m. Two identical, full pipes
connect them in parallel: each has diameter 0.050 m and length 75 m.
The friction factor is 0.007 **in the convention using 4fL/D** (equivalent
Darcy factor 0.028). Entry and exit losses together are 1.5 velocity heads
for each path. Initially the water-surface difference is Δη₀ = 1.8 m.
Find the changes in water levels after 900 s.

Both branches see the same level difference. Their discharges add; their
head losses do not. With a = πD²/4 and total discharge Q = 2au:

    K = 4fL/D + 1.5 = 43.5
    Δη = Ku²/(2g) = RQ²
    R = K/[2g(2a)²] = 143770.731529 s²/m⁵
    Q = C√Δη,   C = 0.002637331723 m^(5/2)/s

Tank areas are A₁ = 9π/4 = 7.068583471 m² and
A₂ = π = 3.141592654 m². Conservation gives:

    dη₁/dt = −Q/A₁,   dη₂/dt = Q/A₂
    dΔη/dt = −C(1/A₁ + 1/A₂)√Δη
    Δη(t) = [max(0, √1.8 − C(1/A₁ + 1/A₂)t/2)]²

The maximum prevents the squared expression from spuriously increasing
after equalisation (2212.843 s). For initially higher tank 1:

    fall in tank 1 = A₂(1.8 − Δη)/(A₁ + A₂)
    rise in tank 2 = A₁(1.8 − Δη)/(A₁ + A₂)

At **900 s**, the level difference is **0.633573163 m**, tank 1 has fallen
**0.358900565 m**, and tank 2 has risen **0.807526272 m**. The transferred
volume is approximately **2.5369 m³**. The rise/fall ratio is exactly
A₁/A₂ = 2.25.

The supplied answer image gives 0.85 m, but its own discharge coefficient
and integration imply about 0.63 m. Its displayed time equation also puts
an inverse on the area sum in the denominator; the correct time equation is
`t = 2(√Δη₀ − √Δη)/[C(1/A₁ + 1/A₂)]`.

## Initial conditions

Only the left reservoir should start at the high level. The reference
solution nevertheless assumes primed pipes and submerged outlets from the
start, with a lower initial water level in the right tank. Absolute initial
levels are unspecified; adding the same elevation to both does not change
the answer. Starting with a completely dry right tank or empty pipes adds a
filling transient which this textbook model does not include.

## Representation in hydraulician

The existing GPU solver resolves a vertical slice per metre of width;
tank storage is proportional to width, not to diameter squared. Drawing
3 m and 2 m wide tanks therefore produces a storage ratio of 1.5 instead
of 2.25. Its wall friction setting is not a direct input for the circular
pipe loss law above. Enlarging the supplied sandbox drawing cannot, by
itself, give a quantitative solution to this problem.

A quantitative exercise needs circular tank storage and a pipe-network
resistance model with the two equal branches explicitly represented.
The drawing can then enlarge the bore and shorten the 75 m run for
legibility while keeping all calculations in the stated physical dimensions.
Such a drawing must be labelled schematic. A Navier–Stokes drawing can
instead demonstrate the direction of exchange qualitatively, but requires
separate calibration and cannot be presented as this exact calculation.
