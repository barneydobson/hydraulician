# Syllabus

The teaching pack, arranged as a syllabus: topics in the order we suggest
teaching them, and under each one the exercises that have been checked. 

Hydraulician includes a variety of exercise types, colour-coded below:

- <span style="display:inline-block;padding:0 7px;border-radius:10px;background:#0969da;color:#fff;font-size:12px;line-height:20px;vertical-align:middle">demo</span> **interactive demo** — a lecturer runs it in front of the class
- <span style="display:inline-block;padding:0 7px;border-radius:10px;background:#2da44e;color:#fff;font-size:12px;line-height:20px;vertical-align:middle">quick</span> **quick exercise** — short enough to do in class
- <span style="display:inline-block;padding:0 7px;border-radius:10px;background:#8250df;color:#fff;font-size:12px;line-height:20px;vertical-align:middle">tutorial</span> **written tutorial with simulation comparison** — the derivation is done on paper, then compared against simulation results

Every exercise opens in the app set up and ready to run; its written brief
lives in the linked folder. The full pack — including exercises not yet
checked or considered redundant — is in the app's Exercises menu (press `E`)
and indexed in [exercises/INDEX.md](exercises/INDEX.md).

## Contents

1. [Hydrostatics](#1-hydrostatics)
2. [Volume conservation](#2-volume-conservation)
3. [Momentum conservation](#3-momentum-conservation)
4. [Energy conservation](#4-energy-conservation)
5. [Shear layers and velocity profiles](#5-shear-layers-and-velocity-profiles)
6. [Pipe flow](#6-pipe-flow)
7. [Hydraulic structures](#7-hydraulic-structures)
8. [Gradually varied flow](#8-gradually-varied-flow)
9. [Waves](#9-waves)
10. [Unsteady pipe flow](#10-unsteady-pipe-flow)
11. [Similitude and the limits of a model](#11-similitude-and-the-limits-of-a-model)

## 1. Hydrostatics

Pressure under still water, and the thrust it puts on a structure — how big it
is, and where it acts. Everything assumes this distribution can be read on sight.

| exercise | type | what it does |
|---|---|---|
| **HS-1** · Three surfaces, one level — a dyke and its piezometer ([open it](https://barneydobson.github.io/hydraulician/?ex=HS-1) · [brief](exercises/HS-1-dyke-piezometer/)) | demo | A dyke between two reservoirs at different levels, with a piezometer tapped into the culvert through it. Read the levels and the face forces with the valve shut, then open it and watch one level and equal forces arrive. |

## 2. Volume conservation

What flows in must flow out or be stored.

*Nothing here yet.*

## 3. Momentum conservation

One control-volume balance: a jet bent by a vane, or a gate holding back a
head, with the force predicted from the momentum flux. The same balance
returns later inside the hydraulic jump.

| exercise | type | what it does |
|---|---|---|
| **HP-2** · Why turbine buckets are cups, not plates ([open it](https://barneydobson.github.io/hydraulician/?ex=HP-2) · [brief](exercises/HP-2-pelton/)) | demo | A jet deflected by a flat plate, a deep-V and a six-stroke Pelton cup. Read the force off the control volume for each and see why the cup delivers nearly twice the plate — and why the flooded V does not. |

## 4. Energy conservation

Head, grade lines and losses: where a flow's energy goes, which losses can be
measured, and how a contraction differs from an expansion.

| exercise | type | what it does |
|---|---|---|
| **QS-2** · Two tanks and two parallel ducts ([open it](https://barneydobson.github.io/hydraulician/?ex=QS-2) · [brief](exercises/QS-2-twin-tanks/)) | quick | Two reservoirs joined by parallel ducts. Predict the level changes at 120 s from a storage balance, run it, and compare — per-student tank widths, so the class pools a spread of answers. |

## 5. Shear layers and velocity profiles

Boundary layers at walls and shear layers inside the fluid: how real velocity
profiles depart from the one-dimensional ideal, and the coefficients that
measure by how much.

*Nothing here yet.*

## 6. Pipe flow

Pressurised flow from single components to whole systems: the friction law,
local losses, pumps and system curves, and junctions whose heads must agree
all at once.

*Nothing here yet.*

## 7. Hydraulic structures

Rapidly varied flow as a family in its own right — weirs, gates, jumps and
culverts — where the free surface stops being hydrostatic and control sections
are made.

*Nothing here yet.*

## 8. Gradually varied flow

The other free-surface class: backwater profiles, found by integrating the
gradually varied flow equation and classified by bed slope against the critical
and normal depths.

*Nothing here yet.*

## 9. Waves

Celerity against depth, what a wave does at a boundary, and where linear wave
theory stops describing what is on the screen.

*Nothing here yet.*

## 10. Unsteady pipe flow

Transients: the surge when a moving column is stopped, the period of the
reflections, and the devices that protect a pipe from both. The topic where
the solver's own celerity stops being a physical number, and the model's
limits become part of the subject.

| exercise | type | what it does |
|---|---|---|
| **UN-1** · The class discovers the celerity ([open it](https://barneydobson.github.io/hydraulician/?ex=UN-1) · [brief](exercises/UN-1-celerity/)) | demo | A steady pipe from a reservoir to a valve. Read the steady v₀ and H₀, slam the valve, pause on the first plateau — and recover the wave celerity from the Joukowsky rise. |
| **HP-3** · Design the surge tower: the class measures the upsurge ([open it](https://barneydobson.github.io/hydraulician/?ex=HP-3) · [brief](exercises/HP-3-surge-tower/)) | tutorial | The written tutorial with simulation comparison: size a surge shaft for a hydropower scheme from the unsteady balance, slam the load, and measure the upsurge and period against your prediction. Bridges hydropower and unsteady pipe flow. |

## 11. Similitude and the limits of a model

Scaling a model result up to the prototype, and telling a scale effect from a
grid effect. The capstone, on purpose: it presumes everything above it.

*Nothing here yet.*

---

**Adding to this page.** An exercise earns its row when it has been checked —
run headless, measured against its brief, and read once more against what it
is claiming to teach. Put it under its topic, in the order the topic teaches,
with its type; how to build and check one is in
[docs/making-exercises.md](docs/making-exercises.md).
