# Teaching pack index — verified demos

Every demo from demo-programme.html, packaged one folder each: a short
README brief (theory · your parameter · what to do · instructor pooling),
collect_plot.py for the Blackboard CSV, the simulated-class data and plot
that prove it works, and rig.js where geometry/instruments are drawn. Each
folder's full verification record and director report live beside it in
`_archive/`, kept out of version control (.gitignore) on the maintainer's
machine — archive weight, not source. Statuses and measured caveats:
_director-status.md. Interface proposals, programme-text amendments and the
measurement watch-outs every worksheet leans on: CHANGES-NEEDED.md.

## Running an exercise

Open the app, press **`E`** (or click **`Exercises ▾`** in the top bar) and
pick the demo by the **ID** in the table below. Direct link for a slide:
**`?ex=<ID>`** — e.g. `http://localhost:8124/?ex=HJ-1`. Every id in the ID
column is its own `?ex=` id; there is no second naming scheme.

Picking a demo puts the whole class at the same starting point: the scene,
**Resolution: Medium** (automatic — no student has to set it) and, where the
demo has one, the drawn rig plus the handful of settings without which the rig
is not a working rig. The card labels those as already set.

It does **not** fill in the rest. The card prints the RULE for your own
parameter — a discharge, a level, a period, a station, a gap to draw — with
**d** your student number's last digit (your lecturer explains the
assignment); you work the rule out, look your row up in the brief's table
where there is one, and set, place or draw it yourself. Coupled values,
instrument positions and staged sequences stay in the student's hands:
getting them wrong and seeing why is the exercise. The one card that still
takes a typed digit is a variant-rig one (DA-1, DA-3, B8), where the digit
picks which captured drawing loads. `↻ Reset to the starting point` on the
card restores the common setup.

How to run an exercise is described once, above — it is the same for all of
them, so the briefs do not repeat it. Every brief follows the trimmed
pattern HP-1 set: short theory, the personalised rule with its lookup table,
a handful of numbered steps, and instructor pooling with a discussion point
or two, with the long verification record moved verbatim to `_archive/`
inside each folder — untracked, local to the maintainer's machine.

**Standing rules (every worksheet carries them):** everyone on Resolution
Medium (the picker sets this) · wait out the spin-up · median-of-the-wobble
reads, never one frame · after changing q, re-check any tailwater ≥ 1.3·y_c ·
pause-and-read promptly (the chart buffer keeps moving).

| ID (= `?ex=` id) | Demo | Folder | Runs on | Students submit |
|----|------|--------|---------|-----------------|
| DA-1 | The scale ladder | DA-1-scale-ladder/ | RIG-B weir ×3 scales | (λ, q, H) |
| DA-2 | Time scales as √λ | DA-2-time-scales/ | RIG-C tank ×λ | (λ, t between marks) |
| DA-3 | Scale effects, live | DA-3-scale-effects/ | DA-1/DA-2 rigs × resolutions | optional (λ, q, resolution, C_d) |
| HP-1 | Max power transmission h_f = H/3 | HP-1-penstock-power/ | hammer + drawn throttle | (gap, q, u) |
| HP-2 | Cups vs plates | HP-2-pelton/ | shared jet rig | — (lecturer demo) |
| NC-1 | Slope-area mystery discharge | NC-1-slope-area/ | **m3** (m1 impossible — kept as contrast) | (x₀, F, Q̂) |
| NC-2 | Is α really 1? | NC-2-alpha/ | s2 stations + gate wake | (station, α) |
| NC-3 | Bed shear and riprap | NC-3-bed-shear/ | s2 sweep + m2 anchor | (τ₀, D_min) |
| QS-1 | Predict the drain | QS-1-drain-predict/ | jet | (t_pred, t_meas) |
| QS-2 | Two reservoirs find a level | QS-2-twin-tanks/ | RIG-C | (A₂, t_½) |
| UN-1 | The class discovers c | UN-1-celerity/ | hammer + nozzle rungs | (v₀, ΔH) |
| UN-2 | Flow establishment | UN-2-establishment/ | estab | (level, u_max, t_75) |
| UN-3 | Surge tank vs the ODE | UN-3-surge-tank/ | hammer + standpipe | (b_s, v₀, y_max, T) |
| WV-1 | Dispersion, one period each | WV-1-dispersion/ | wavedeep + waveshallow | (T, L, flume) |
| WV-2 | The buried wave gauge | WV-2-buried-gauge/ | wave + wavedeep | (T, ratio or "below noise") |
| WV-3 | Reflection coefficient | WV-3-reflection/ | wavesurge + wave | (T, K_refl) |
| MO-1 | Sluice gate C_d and thrust | MO-1-gate-cv/ | RIG-B + gate | (C_d, F_R) |
| MO-2 | Jet on a plate, jet on a vane | MO-2-jet-vane/ | shared jet rig | optional stagnation ratio |
| FR-1 | The friction law | FR-1-friction-law/ | RIG-A | (level, H₁, H₂, V) |
| LL-1 | Borda–Carnot expansion | LL-1-borda-carnot/ | RIG-A + step | (h_L meas, h_L ideal) |
| LL-2 | Find the throttle | LL-2-find-throttle/ | RIG-A + hidden fault | (x_found, k_L) per pair |
| PU-1 | System curve, honest operating point | PU-1-system-curve/ | sump + spout riser | (Q, H) |
| WE-1 | Rating a sharp-crested weir | WE-1-sharp-weir/ | RIG-B | (q, H) |
| UF-1 | Normal depth ∝ q^0.6-ish | UF-1-normal-depth/ | s2 | (q, y_n) |
| FB-1 | The hump that chokes | FB-1-choking-hump/ | RIG-B + hump | (Δz_c, Δz_pred) |
| FB-2 | Critical depth three ways | FB-2-yc-three-ways/ | RIG-B crest + overfall | three depths |
| HJ-1 | Bélanger from a room of flumes | HJ-1-belanger/ | h23 (+ s1 coda) | (Fr₁, y₂/y₁) |
| GV-1 | The class digitises the backwater | GV-1-backwater/ | m1 | (x, elevation) |
| GV-2 | Profile safari | GV-2-profile-safari/ | sandbox game | score + screenshots |
| CS-1 | When does your chamber spill? | CS-1-cso-spill/ | bespoke CSO, spout-fed | (gap, q_spill) |
| B1 | T = 4L/c with your own valve | B1-period-4Lc/ | hammer | (L, T) |
| B2 | The flexible pipe (c slider) | B2-flexible-pipe/ | hammer | (ΔH₇₀, ΔH₁₄₀) |
| B3 | Dam break: the moving jump | B3-dambreak/ | dambreak | (bore speed, station pair) + shared neg-wave |
| B4 | Orbital decay off the trails | B4-orbital-decay/ | wavedeep tracers | (T, surface/bed ratio — or "below noise") |
| B5 | Iribarren map jigsaw | B5-iribarren/ | both beaches | (cell, ξ, behaviour, surf width) per pair |
| B6 | Ursell number | B6-ursell/ | waveshallow | (T, U_r, asymmetry) |
| B7 | Venturi meter rating | B7-venturi-rating/ | venturi | (q, Δh) |
| B8 | Three orifices, three coefficients | B8-three-orifices/ | jet + drawn lips | (lip type, C_c) |
| B9 | Three reservoirs, one junction | B9-three-reservoirs/ | RIG-C ×3, dynamic | (z_B(0), Q_B, junction head) |
| B10 | Lift the crest until the pipe gives up | B10-crest-vs-hgl/ | RIG-A + raised crest | (level, z_sep, HGL at the crest) |

Rigs: RIG-A (pressurised duct) card = FR-1/rig.js · RIG-B (flat channel) card
= WE-1/rig.js · RIG-C (twin tanks) card = QS-2/rig.js. Each dependent demo's
rig.js extends its family card.
