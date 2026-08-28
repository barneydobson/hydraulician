# Time averaging: discrete conservation and free-surface reconstruction

**Status: phase C design; not implemented.** This document specifies the
averaged quantities, discrete balances, reconstruction and acceptance tests.

The VIEW family provides a **Live / Average** toggle. In Average mode the solver
continues to advance while diagnostic accumulators collect the flow. Live mode
displays the instantaneous field. No simulation pass reads an accumulator, so
the averaging mode does not alter the numerical solution.

Average is a measurement mode, not a blur filter. While it is active, the field,
the channel overlay and every number derived from that overlay must describe the
same averaging window. Otherwise a single screenshot would combine two
different flow states.

Two requirements fix the design, and everything below follows from them:

1. **The mean must satisfy the solver's own discrete conservation law**, not a
   continuum approximation to it. Conservation diagnostics and conservative
   discharge must use the numerical flux advanced by the VOF pass.
2. **The interface may smear in storage, but must be reassembled on readout.**
   The stored mean fill describes the surface distribution; displayed surfaces
   and reported depths require a separate reconstruction.

The hard part is that the quantity this solver conserves is not the quantity
that makes a good picture. The numerical transport flux and the velocity used
for visualisation are different finite-grid quantities, so §§3–4 keep them
separate.

---

## 1 · Conservative flux and source operators

From [numerics.md](numerics.md): in the heavy-fluid limit the fill fraction *is*
the density, `ρ = f ρ_w`, and the continuum statement the vof pass approximates
is

```math
\frac{\partial f}{\partial t} + \nabla\cdot(f\mathbf{u}) = 0
```

What it actually advances is a discrete flux-form update with a **van Leer face
reconstruction**, an **interface-compression flux**, and a **donor-cell
positivity limiter**:

```math
f^{m+1}_{ij} = f^{m}_{ij} - \frac{h_m}{\Delta x}\Bigl[(F^{E}-F^{W}) + (F^{N}-F^{S})\Bigr]^{m}_{ij}, \qquad
F = \operatorname{donorClamp}\bigl(u_f\,f_f^{\mathrm{vL}} + F_{\mathrm{comp}}\bigr)
```

**The cell-centred product `f u` is not this flux.** For
fills `(0, 0.2, 0.8, 1)` with positive face velocity, `faceVal` returns
`f_face = 0.35` where the upwind cell value is `0.20` — a factor of **1.75**,
before compression or clamping is applied at all. The compression flux
`c_α|u|·α(1−α)·∇α/|∇α|` is deliberately artificial: it conserves `f` while
sharpening the interface, and it cannot be represented as fluid travelling at
the displayed velocity.

The pass also applies non-conservative updates after flux divergence. These are
represented by a source term in the discrete balance:

- the **relaxation sponge** at level-controlled edges, which represents
  exchange with an external reservoir — in the shader's words, *"Mass
  conservation is intentionally given up inside the sponge: it IS the
  reservoir"*;
- the two point-volume sources;
- the initial `min(f_new, 8.0)` and final range safety clamps.

The ghost ring supplies boundary values and is excluded from the set of
conserved control volumes. Flux through its interfaces is retained as boundary
flux. Section 5 includes the post-advection source term for every interior cell.

Both interior neighbours of a face compute the identical flux. Face velocity,
van Leer reconstruction, compression and donor limiting therefore give
`F^E_{i-1,j}=F^W_{i,j}` and `F^N_{i,j-1}=F^S_{i,j}`. Emitting `(F^E,F^N)` stores
each interior face once. The left and bottom boundary faces require explicit
handling because their owner texels lie in the early-return ghost ring; §4.2
specifies that handling.

---

## 2 · Why a conditional average is the wrong tool

A conditional average accumulates `u` only where the cell is wet
(`χ = 𝓗(f − ½)`), divides by wet duration, and stores the wet fraction. Its
result does not recover the fill-weighted transport:

```math
\gamma\,\bar{u} \;\neq\; \langle f u\rangle
```

The difference is the correlation between fill and velocity. The threshold also
introduces a discontinuity within the surface-excursion band and makes the
result depend on a numerical cut-off.

Both objections are answered by weighting with `f` itself.

---

## 3 · The Favre average — a continuum argument, and its limits

Since `f` is the density, the average that leaves the *continuum* equations
looking like their instantaneous forms is the density-weighted (Favre) average:

```math
\bar{f} = \langle f \rangle, \qquad
\hat{\mathbf{u}} = \frac{\langle f\,\mathbf{u}\rangle}{\langle f\rangle}
```

with `⟨·⟩` a plain time average over the window — no conditioning, no threshold.
The Favre weight does continuously what `χ` did with a step: a frame in which
the cell held air contributes `f ≈ 0` and cannot drag the mean toward zero.

In the continuum, averaging the conservation law telescopes on the left and
gives `∇·⟨f u⟩ = −[f(T)−f(0)]/T`, so the mean flux is divergence-free to
`O(1/T)`.

**That statement does not transfer to the accumulator.** `⟨f u_c⟩` sampled at
cell centres once per frame differs from the scheme's `⟨F⟩` by three distinct
errors: temporal quadrature (one sample per frame representing many substeps),
spatial reconstruction (§1's factor of 1.75 at the interface), and model flux
(compression and donor limiting are absent). Thus `û` is the physical mean
velocity used for display, but it does not certify the discrete mass balance.
Sections 4.1 and 4.2 use separate accumulators.

**Momentum.** Favre-averaging the momentum equation gives

```math
\frac{\partial (\bar{f}\hat{\mathbf{u}})}{\partial t}
+ \nabla\cdot\left(\bar{f}\,\hat{\mathbf{u}}\hat{\mathbf{u}}\right)
+ \nabla\cdot\left(\bar{f}\,\mathbf{R}\right)
= -\frac{\nabla \bar{p}}{\rho_w} + \bar{f}\,\mathbf{g} + \dots,
\qquad
\mathbf{R} = \frac{\langle f\,\mathbf{u}''\mathbf{u}''\rangle}{\langle f\rangle}
```

This is a continuum interpretation, not a discrete law satisfied by the solver:
the velocity pass advances momentum in advective rather than conservative form,
and its clamps, source overwrites, wall function and staggered interpolation do
not commute with averaging. A field of the mean flow does not close a mean
momentum budget without the fluctuation stress `R`. The control-volume and flux
instruments therefore retain separate EMAs of their complete instantaneous
budgets.

---

## 4 · Three accumulators

The three accumulators have distinct definitions and uses.

| Product | Accumulated | Cadence | Answers |
|---|---|---|---|
| **Favre display** (§4.1) | `f`, `f u_c`, `f w_c`, `p/ρ_w` | per frame | mean-flow display fields |
| **Exact transport** (§4.2) | `F^E`, `F^N`, source rate | per substep | discrete mass balance |
| **Column and overlay** (§4.3) | `d`, `q`, `η`, `M₂` of `η` | per frame | reported measurements and channel overlay |

### 4.1 The Favre display accumulator — `nx × nz`

One `RGBA32F` ping-pong, one fullscreen pass per frame, storing **running
weighted means** rather than raw sums (§4.4):

```math
\bigl(\overline{f u_c},\; \overline{f w_c},\; \bar f,\; \overline{p/\rho_w}\bigr)
```

from which `û = \overline{f u_c}/\max(\bar f, ε)` and `ŵ` likewise. Pressure is
Reynolds-averaged, not Favre-averaged, because it enters the mean momentum
equation as `−∇p̄`; it cannot be recovered from `f̄` either, since the EOS is
nonlinear.

The shader channel `U.b` stores kinematic pressure `p/ρ_w` in `m²/s²`.
Implementation code therefore obtains pressure head as `U.b/g`; it must not
divide that channel by density a second time.

**Collocation.** `u` lives on the west face, `w` on the south face, and `f` at
the centre. The accumulator interpolates velocity to the centre before
weighting it by `f`:

```math
u_c = \tfrac{1}{2}\bigl(u_{i} + u_{i+1}\bigr), \qquad
w_c = \tfrac{1}{2}\bigl(w_{j} + w_{j+1}\bigr)
```

exactly as `FS_COL` already does — and accumulate `f·u_c`. Multiplying `f` by
the west-face velocity alone introduces a directional bias and still does not
reproduce the VOF flux.

This accumulator serves the **colouring, the heads and the excursion band**.

### 4.2 The exact transport accumulator — per substep, via MRT

`FS_VOF` gains a **second render target**. It emits the fluxes it has already
computed, so no flux arithmetic changes and the identical-flux rule of §1 is
untouched:

```math
\bigl\langle F^{E}\bigr\rangle,\quad
\bigl\langle F^{N}\bigr\rangle,\quad
\bigl\langle S \bigr\rangle
```

as running `h`-weighted means. For each interior cell, preserve the unclamped
conservative candidate

```math
f_{\mathrm{cons}}^{m+1}
= f^m-h_m
  \left[(F^E-F^W)+(F^N-F^S)\right]^m/\Delta x.
```

apply the safety clamps, sponges and point sources to obtain `f_final`, and
define the source **rate**

```math
S^m = \frac{f_{\mathrm{final}}^{m+1}-f_{\mathrm{cons}}^{m+1}}{h_m}.
```

The third channel stores the running mean of this rate. Equivalently, an
implementation may accumulate the unweighted increments
`f_final−f_cons` and divide their sum by `T`; it must not apply an additional
factor of `h` to those increments.

For interior cells, the red and green channels store `F^E` and `F^N`. The
divergence is evaluated as

```math
(F^E_{ij}-F^E_{i-1,j}+F^N_{ij}-F^N_{i,j-1})/\Delta x.
```

This layout requires two boundary cases. Texels in the left ghost column store
the flux through the face between columns 0 and 1, evaluated with exactly the
same expression as `F^W` in interior column 1. Texels in the bottom ghost row
store the corresponding `F^S` of interior row 1. Right and top boundary fluxes
are already stored as `F^E` and `F^N` by the last interior column and row. Ghost
fill is boundary state, not conserved storage, and has no `S` entry.

Five details matter:

- solid-cell returns pass all accumulator channels through unchanged;
- ghost-cell returns update only the required left or bottom boundary-flux
  channel and preserve the other channels;
- `F` and the transport accumulator ping-pongs swap together every substep;
- the transport duration is advanced every substep. If `T_m` is the duration
  before a substep, its running-mean weight is `h_m/(T_m+h_m)`;
- separate `vof` and `vof+accum` program variants avoid MRT bandwidth when
  Average is inactive.

### 4.3 The column and overlay accumulator — `nx × 1`

`FS_COL` already runs every frame and already resolves nappes, spray, soffits
and perched pools by walking the *connected* wet run on sharp data. Its output
is accumulated in a second, tiny ping-pong:

```math
\bigl(\bar d,\; \bar q,\; \bar\eta,\; M_2^{\eta}\bigr)
```

giving `⟨d⟩`, `⟨q⟩`, `⟨η⟩` and `σ_η = √(M₂/T)`. The bed is static within a
window (any geometry edit resets), so it needs no channel.

Connectivity is decided on each instantaneous field before the resulting
scalars are averaged. This prevents the mean fill from defining a connected
body that was not present instantaneously (§7.2).

These are the **authoritative readings**. Note what they are and are not: `⟨d⟩`
and `⟨q⟩` are geometric, built on `min(f,1)`, which is what a flume measures and
is deliberately *not* the conserved `f` balance — the slot excess is conserved
storage but not geometric water. And `⟨η⟩` is the mean of a top-cell selection,
so the surface *line* may properly be drawn at it while the conservation claim
belongs to `⟨d⟩`, an integral.

**The channel overlay consumes the mean columns too.** While Average is active,
assemble the same four-channel buffer that `OVERLAY.analyse` receives live,

```math
\bar C_i = \left(z_{b,i},\;\bar d_i,\;\bar q_i,\;\bar\eta_i\right),
```

and derive the displayed `d`, `d_c`, `d_n`, `V`, `Fr`, energy grade line,
profile class and jump boxes from `C̄`. Thus `d_c=(q̄²/g)^{1/3}`, the EGL and
`d_n` are quantities **from the mean column**, not time averages of their
instantaneous values. `findJumps` likewise receives the analysis built from
`C̄`, so its `d₁`, `d₂` and conjugate-depth comparison agree with the plotted
profile. No channel-overlay quantity may fall back to the live column buffer
while Average is active.

`OVERLAY.analyse` already prefilters live `d` and `q` in space and time, then
applies an EMA to its global `d_n` estimate. Average mode uses `d̄` and `q̄`
directly: it bypasses the initial `sm()` prefilter, `_hA`, `_qA` and the `_ynK`
EMA. The geometry guards, bed-slope calculation and the documented windows used
to differentiate the EGL remain in place. Applying the live prefilters to `C̄`
would introduce a second averaging operation and would broaden the mean jump.
`OVERLAY.resetEstimates(sim)` runs on both transitions between Live and Average
so neither mode inherits the other's temporal state.

### 4.4 Sampling and online statistics

The display and reading accumulators advance **once per rendered frame**, by
`Δt_n = Σ_k h_k` — the `simAdvanced` that `tickFrame` already computes. A
full-grid accumulation per substep would add a separate pass while `nsub` can
reach 400. The transport accumulator advances per substep within `FS_VOF`
because the exact numerical flux is available there.

Weighting uses `Δt`, not frame count. Since `Δt_n` varies between frames,
`(1/N)Σ` is a rendered-frame average rather than a time average. Their
difference is `−cov(φ_n,Δt_n)/Δt̄`; adaptive workload can correlate `Δt_n` with
the sampled state.

**Store running means, not sums.** With `T` held on the CPU as a uniform,

```math
\bar\phi_{n+1} = \bar\phi_n + \frac{\Delta t_n}{T_n + \Delta t_n}\left(\phi_n - \bar\phi_n\right)
```

and weighted Welford for the variance,

```math
M_2^{n+1} = M_2^{n} + \Delta t_n\,(\phi_n - \bar\phi_n)(\phi_n - \bar\phi_{n+1})
```

In `RGBA32F`, raw sums lose small `Δt` increments as `T` grows. In addition,
`⟨η²⟩ − ⟨η⟩²` for a 5 mm wobble on a 1 m datum is a ratio of
`2.5×10⁻⁵` against float32's `1.2×10⁻⁷` eps — about **two surviving digits of
σ²**. Welford `M₂` occupies the same channel and avoids this subtraction.

---

## 5 · The discrete mass balance, and two residuals

Let `Ω` denote the interior control-volume cells; the ghost ring is excluded.
Telescoping the substep update over the window and using
`F^E_{i-1,j}=F^W_{i,j}` gives

```math
\boxed{\;\frac{f(T)-f(0)}{T} \;+\; \nabla_h\!\cdot\!\left\langle \mathbf{F}\right\rangle \;-\; \left\langle S \right\rangle \;=\; 0\;}
```

up to float32 accumulation error, with `f(0)` copied when Average is switched
on. The identity applies in source cells as well as source-free cells because
`S` contains the complete difference between the conservative candidate and
the final interior fill. Boundary exchange appears through the four boundary
faces of `Ω`.

It buys two things beyond the check itself:

- **A conservative numerical transport discharge.**
  `Q̄_F = Δx Σ_j ⟨F^E⟩_{ij}` is constant between vertical sections when the
  intervening reach has zero mean storage change, zero integrated source, and
  no net flux through its top or bottom boundaries. `Q̄_F` includes the
  artificial interface-compression flux and is therefore distinguished from
  the geometric discharge `q̄` of §4.3.
- **A display-field conservation diagnostic.** The same expression evaluated
  on `⟨f u_c⟩` instead of `⟨F⟩` gives a second, larger residual `𝓡_disp`. It does
  not tend to zero with `T`: it settles on an `O(Δt_frame, Δx^p)` floor set by
  the quadrature and reconstruction errors of §3. It quantifies the difference
  between the display reconstruction and the conserved transport field.

---

## 6 · The fields, all derived from the mean state

Only `(f̄, û, ŵ, p̄)` is accumulated for display; each colouring is computed from
it by the same display-pass branch that draws it live:

```math
\frac{\bar{p}}{\rho g}, \qquad
\tilde{h} = z - S_0 x + \frac{\bar{p}}{\rho g}, \qquad
\tilde{H} = z - S_0 x + \frac{\bar{p}}{\rho g} + \frac{\hat{u}^2+\hat{w}^2}{2g}
```

```math
\tilde{\omega} = \frac{\partial \hat{w}}{\partial x} - \frac{\partial \hat{u}}{\partial z}, \qquad
\widetilde{Fr} = \frac{|\hat{u}|}{\sqrt{g\,\langle d\rangle}}, \qquad
\tilde{m} = \bar{f}\,\hat{u}\,|\hat{\mathbf{u}}|
```

One accumulator serves all seven fields. Changing the displayed field does not
restart the averaging window.

### What may and may not be claimed

`h` is linear in pressure and elevation, and elevation is fixed. Therefore
`h̃ = h̄` wherever the accumulator and the live display use the same pressure
definition. This equality does not require uniform `f`.

`ω̃` is the vorticity of the Favre mean. It equals `⟨ω⟩` where `f` is constant
over time and across the derivative stencil. Elsewhere the two differ through
fill–velocity correlation.

`H`, `Fr` and `m` are nonlinear: each is the field **of the mean flow**, not the
mean of the field. If `H̄` denotes a Reynolds time average using the same
pressure definition, then

```math
\bar H-\widetilde H
= \frac{\langle|\mathbf u|^2\rangle-|\hat{\mathbf u}|^2}{2g},
```

which is not generally the Favre turbulent kinetic energy `k/g`. A Reynolds
mean energy head would require the additional channel `⟨|u|²⟩`. A consistently
Favre-averaged energy head would instead require `⟨f|u|²⟩` and `⟨fp⟩`. Neither
quantity is part of this design.

The legend therefore labels `H̃`, `Fr̃` and `m̃` **"from the mean flow"**.

---

## 7 · Putting the surface back

### 7.1 Compaction is a closed form, not an iteration

Storing `f̄` distributes the interface across the surface-excursion band.
Geometric reconstruction must remove compressible slot storage before
integrating depth.

Define the bare one-sided kinematic EOS pressure
`P_EOS = p_EOS/ρ_w = c² max(f−1,0)`. The following identity then holds on both
branches:

```math
\min(f,1) \;\equiv\; f - \frac{P_{\mathrm{EOS}}}{c^{2}}.
```

For a hydrostatic column, the slot excess relative to geometric depth is
`g d / 2c²`:
**0.78% — 7.9 mm on 1 m — at `c = 25`, and 7.7%, 77 mm, at `c = 8`**, the
celerity slider's low end.

`U.b` is not `P_EOS`. `press()` subtracts a bulk-divergence term
`β(∇·u)·smoothstep(0.90,1,f)`, clamps at zero, and is evaluated from the
pre-update `f`, so it lags the fill by one substep. Let `P_diag=U.b`. The stored
channels therefore give the approximate geometric fill and 2D depth

```math
\bar g_{\mathrm{diag},ij}
= \operatorname{clamp}
  \left(\bar f_{ij}-\frac{\bar P_{\mathrm{diag},ij}}{c^2},0,1\right),
\qquad
\bar{d}^{\,\text{2D}}_i
= \Delta x \sum_{j\in\text{body}}
  \bar g_{\mathrm{diag},ij}.
```

with column error bounded by

```math
\left|\delta d_i\right|
\le \frac{\Delta x}{c^2}
\sum_{j\in\text{body}}
\left\langle\left|P_{\mathrm{EOS},ij}-P_{\mathrm{diag},ij}\right|\right\rangle .
```

An exact sampled geometric fill would need `min(f,1)` accumulated in its own
right, or the bare EOS pressure evaluated from the same sampled `f`. The four
display channels cannot hold `f u`, `f w`, `f`, a diagnostic pressure and an
exact geometric fill. Section 4.3's `⟨d⟩` is therefore the authoritative depth.
The 2D reconstruction is a diagnostic cross-check. Its acceptance tolerance is
established by end-to-end tests over the supported `c`, bulk damping and
resolution ranges.

The `g = 0` scene is excluded by construction: its EOS is two-sided, `p` can be
negative, and it has no free surface to reconstruct.

### 7.2 Connectivity must not be decided on the mean

Compaction requires selecting the cells that belong to the column's lower water
body. Time averaging does not preserve instantaneous connectivity.

A nappe that intermittently contacts a pool can leave nonzero mean fill
throughout the intervening gap. A connectivity test on that mean field can then
join bodies that are separate during part of the averaging window.

Section 4.3 applies `FS_COL`'s connected-run walk to every instantaneous field:
start at the lowest open cell with `min(f,1)>0.25`, walk upward, stop at a solid
or after three consecutive cells with `min(f,1)<0.25`, and integrate only the
selected run. Averaging its output gives `⟨d⟩`, `⟨q⟩`, `⟨η⟩` and `σ_η`.

The 2D diagnostic applies the same operational rule to `ḡ_diag`: start at the
lowest open cell with `ḡ_diag>0.25`, allow at most two consecutive cells with
`ḡ_diag<0.25`, and stop at a solid. This fixed rule defines the `mask` input to
`SIM.reconstruct`. A discrepancy between `d̄²ᴰ` and `⟨d⟩` beyond the validated
§7.1 tolerance identifies connectivity introduced by averaging.

### 7.3 The line is the mean; the band is the level sets

`η̄ = ⟨η⟩` is the elevation of the displayed line. The `f̄ = ½` level set is the
median and differs from the mean for a skewed surface-elevation distribution.

Mean level and equivalent water depth are not interchangeable in an aerated or
intermittently connected column. Average mode keeps the line at `η̄`, because
that is the mean position of the visible upper surface, and reports the signed
surface–volume gap

```math
\delta_{\mathrm{a},i}
= \bar\eta_i-\left(z_{b,i}+\bar d_i\right).
```

The overlay labels `d̄` as equivalent water depth and `δ_a` as the
**aeration / partial-fill gap**. A positive value is the void height that would
be removed by compacting the connected envelope to `min(f,1)=1`; a negative
value records sub-threshold partial fill above the top-cell level selected by
`FS_COL`. The line is not moved to `z_b+d̄`: doing so would make it disagree
with the visible surface. Instead, the reported identity
`η̄−z_b=d̄+δ_a` makes the two readings explicit.

Where the interface is sharp, `f` is an indicator and `f̄(z) = Pr(η > z)` is the
exceedance function, so the level sets of `f̄` are the percentiles of `η`:

```math
\bar f = 0.05 \iff z = \eta_{95}, \qquad
\bar f = 0.95 \iff z = \eta_{05}
```

Thus **`f̄ = 0.05` is the high edge** and `f̄ = 0.95` is the low edge. Section 8
tests this orientation explicitly.

The band `0.05 ≤ f̄ < 0.95` is the 5th-to-95th percentile of `η`: the surface
stood inside it for 90% of the window. It has an independent estimate in `σ_η`
from §4.3, and the two must agree — for a sinusoidal surface
`(η₉₅−η₀₅)/σ_η = 2.7936` exactly, against `3.2897` for a Gaussian one. The
percentile levels and `σ_η` provide independent checks from the field and column
accumulators.

**Masking.** Colour where `f̄ ≥ ½`; a translucent wedge where `0.05 ≤ f̄ < 0.95`;
nothing where `f̄ < 0.05`. Cells inside the band render *inside the band*,
deliberately.

---

## 8 · The synthetic test battery

Reconstruction is implemented as a pure function,
`SIM.reconstruct(fbar, pbar, mask, c, dx)`, where `pbar` contains the mean of
the kinematic-pressure channel `U.b`. The application and synthetic-array tests
use the same function.

Groups A–E are pure-function tests. Their fill and pressure arrays are
constructed at the same sample time, so no velocity/VOF lag is present. Group F
is end-to-end and uses the validated §7.1 tolerance. Group G tests numerical
robustness.

### Group A — accumulator arithmetic

| # | Case | Expected | Catches |
|---|---|---|---|
| A1 | Constant field, N frames | `f̄ = f`, `û = u`, `P̄_diag = P_diag` exactly | wiring, normalisation by `T` |
| A2 | Alternating `Δt = 1, 3` with `φ = 0, 4` | mean `= 3`, not `2` | frame-count averaging |
| A3 | Alternating `f = 1, 0` with `u = 10, 0` | `û = 10`, not `5` | Reynolds-averaged velocity |
| A4 | Same as A3 | `f̄ = 0.5` | Favre/Reynolds confusion in the fill |
| A5 | Linear `u` field on the staggered grid | `û` equals the cell-centred value | multiplying `f` by the west face alone (§4.1) |
| A6 | Source increments `Δf_S = 2h` with `h = 1, 3` | `S̄ = 2`, and `ΣΔf_S/T = 2` | treating an increment as an `h`-weighted rate |

### Group B — compaction and compressibility

| # | Case | Expected | Catches |
|---|---|---|---|
| B1 | Hydrostatic column, `η = 1.0`, `c = 25`, consistent `P_EOS` | `d = 1.0` to float precision; raw `Σf̄Δx = 1.00785` | missing `−P̄_EOS/c²`, error 7.9 mm |
| B2 | Same at `c = 8` | `d = 1.0`; raw `= 1.0766` | missing correction at low celerity |
| B3 | Pressurised column under a soffit | `f̄ − P̄_EOS/c² = 1` in **every** cell | the identity on its `f > 1` branch |
| B4 | Dry column | `d = 0`, bed reported, no NaN | division by `max(f̄, ε)` |

### Group C — a wobbling surface, known statistics

`η(t) = η₀ + a sin ωt` over a whole number of periods, sharp interface.

| # | Case | Expected | Catches |
|---|---|---|---|
| C1 | Mean depth | `⟨d⟩ = η₀ − z_b` exactly | bias in the window |
| C2 | Variance via Welford | `σ_η = a/√2 = 0.70711a` | the `M₂` channel |
| C3 | Band level sets | `η₉₅ = η₀ + 0.98769a`, `η₀₅ = η₀ − 0.98769a` | the arcsine law |
| C4 | **Band orientation** | `f̄ = 0.05` is the **high** edge | the inversion of §7.3 |
| C5 | Cross-check | `(η₉₅−η₀₅)/σ_η = 2.7936` (vs 3.2897 Gaussian) | the two routes disagreeing |
| C6 | **Skewed surface**: `η_hi` for 30% of the window, else `η_lo` | line at `0.3η_hi + 0.7η_lo` (mean), **not** `η_lo` (median) | drawing the median for the mean |
| C7 | Window of 1.25 periods | the computed part-period bias | §4.4's quadrature story |

C6 verifies that the line uses the mean rather than the median.

### Group D — falling jets and connectivity

| # | Case | Expected | Catches |
|---|---|---|---|
| D1 | Pool + 4-cell air gap + steady nappe (`f = 0.6`) | two bodies; pool depth exact; nappe **excluded** | folding the nappe into the depth |
| D2 | Gap of 1, 2, 3, 4 dry cells | **bridged, bridged, separated, separated** | the `dry > 2` rule, in both directions |
| D3 | **Intermittent contact**: nappe bridges for 30% of the window | `⟨d⟩` and `d̄²ᴰ` both computed from the specified fill arrays — including nappe and bridge mass — and asserted to differ by that computed amount | §7.2's manufactured connectivity |
| D4 | Flapping nappe, `f̄ = 0.2` over 5× its thickness | unmasked integral over the prescribed jet region equals its true mean thickness | thresholding a smeared jet away |
| D5 | Spray: isolated `f̄ = 0.01` cells above the band | excluded from the body | spray inflating the depth |

D3 expected values are computed directly from the specified arrays, including
the nappe and bridge contributions selected by §7.2's fixed rule.

### Group E — geometry

| # | Case | Expected |
|---|---|---|
| E1 | Perched pool above a lower pool, separated by solid | two bodies, each compacted separately |
| E2 | Tilted-bed (`S₀`) scene | the reduction is bed-relative and unaffected |
| E3 | Bed raised above `z = 0` | body found from the lowest **wet** cell, not the lowest non-solid |
| E4 | `g = 0` scene | reconstruction refuses, with a reason — two-sided EOS |

### Group F — conservation, end to end (GPU)

For F1, define the relative cancellation residual as
`r_𝓡 = ‖𝓡‖∞/max(‖storage‖∞+‖∇ₕ·F̄‖∞+‖S̄‖∞, 10⁻¹² s⁻¹)`.
The target tolerance is provisional until measured on each supported GPU path.

| # | Case | Expected |
|---|---|---|
| F1 | Local transport residual in source-free interior cells | `r_𝓡` remains below the measured float32 tolerance; design target `10⁻⁶` |
| F2 | `Q̄_F = ΔxΣ_j⟨F^E⟩` along a steady source-free reach with closed vertical boundaries | one value across every section within the F1 tolerance |
| F3 | Source-free draining domain with `f(T) ≠ f(0)` | storage-change rate plus signed outward boundary flux is zero |
| F4 | Sponge, each point source, and each safety clamp | residual including `⟨S⟩` meets F1; recomputing with `S=0` gives `𝓡=⟨S⟩` |
| F5 | Left and bottom open-boundary exchange | storage-change rate plus all signed outward boundary fluxes minus integrated `S` is zero |
| F6 | Display residual `𝓡_disp` on `⟨f u_c⟩` | approaches an `O(Δt_frame, Δx^p)` floor; frame-rate and resolution sweeps measure each dependence |
| F7 | Source-free whole-period wave window | endpoint storage term returns to its initial value within solver tolerance; transport balance closes, while `𝓡_disp` retains its discretisation floor |

### Group G — numerical robustness

| # | Case | Expected |
|---|---|---|
| G1 | 5 mm wobble on a 1 m datum, `10⁶` increments | Welford `M₂` gives `σ_η` to 3 digits; raw `⟨η²⟩−⟨η⟩²` demonstrably loses it |
| G2 | Window of `10⁴` s at 60 fps | running mean unbiased; raw sums show drift |

### Group H — overlay consistency

| # | Case | Expected |
|---|---|---|
| H1 | Average active with a fixed `C̄` and a deliberately different live column buffer | `d`, `d_c`, `d_n`, `V`, `Fr`, EGL and profile class use only `C̄` |
| H2 | Two sample histories with the same final `C̄` but different ordering | Average-mode overlay values are identical; no `sm()`, `_hA`, `_qA` or `_ynK` prefilter remains |
| H3 | Mean profile containing a hydraulic jump | jump-box position, `d₁`, `d₂` and conjugate-depth result come from `C̄` |
| H4 | Aerated connected column | line at `η̄`, depth readout `d̄`, gap readout `δ_a`, and `η̄−z_b=d̄+δ_a` |
| H5 | Switch Average → Live → Average | each transition resets overlay temporal estimates; neither mode inherits the other's state |

---

## 9 · Reset conditions

All three accumulators are zeroed, `T ← 0`, and `f(0)` re-copied, on:

- switching Average on;
- `R` / `resetWater`;
- any geometry edit — `addSeg`, `undoSeg`, `clearSegs`;
- a scene change, and the rebuild a resolution change performs;
- the end of spin-up.

`OVERLAY.resetEstimates(sim)` is also called whenever the mode changes in either
direction. Average mode bypasses the live depth/discharge prefilters and the
overlay's temporal EMAs; resetting on entry and exit prevents live-mode state
from crossing the mode boundary.

These events change the geometry, initial condition or sampling population and
therefore define a new averaging window. Spin-up is excluded because it is an
initialisation interval rather than part of the reported flow state.

While paused, `Δt_n = 0`; accumulators and averaging duration remain unchanged.

The legend prints `T`, the elapsed averaging time, and `f̄` under the cursor. It
also reports the excursion-band width, the residuals of §5, and the 1D/2D depth
discrepancy of §7.2. The cursor readout reports `δ_a` whenever the surface line
and equivalent water depth differ. No generic convergence time is imposed
because several scene timescales are emergent rather than prescribed.

---

## 10 · Cost

| | Per frame | Per substep | Memory |
|---|---|---|---|
| Favre display | 1 fullscreen pass | — | `RGBA32F` ping-pong, 22 MB at Ultra |
| Exact transport | — | 1 texture read + write inside `FS_VOF` | `RGBA32F` ping-pong, 22 MB at Ultra |
| Column and overlay | 1 pass on `nx × 1` | — | negligible |
| Residual | — | — | one copy of `f(0)` |

The per-frame passes are expected to add less than 0.5% at representative
`nsub`. The transport accumulator adds one texture read and write per cell per
substep. Its provisional cost estimate is **20–35% of simulation time** while
Average is active and must be replaced by measurements on the supported GPU
paths. The `vof` / `vof+accum` variants avoid this cost while Average is
inactive.

All buffers are allocated lazily on first use, released when Average is switched
off, and included in `release()`.

---

## Notation

Symbols follow [notation.md](notation.md): depth `d`, level `η`, piezometric
head `h = z + p/ρg`, energy head `H`, velocity `u = (u, w)` with `w` the
vertical component, `z` the domain vertical, pressure head always spelled
`p/ρg`. New here: `⟨·⟩` and an overbar for a time average over the window, `^`
for a Favre (fill-weighted) average, `u″ = u − û` the Favre fluctuation, `R` the
Favre Reynolds stress, `k` its trace as turbulent kinetic energy per unit mass,
`F` the limited VOF face flux, `S` the post-advection source rate,
`P_EOS=p_EOS/ρ_w` the bare kinematic EOS pressure, `P_diag=U.b` the diagnostic
kinematic pressure, `T` the averaging-window duration, `M₂` the Welford second
moment, `σ_η` the surface standard deviation, and `𝓡` the conservation residual
of §5. A tilde marks a field computed from the mean state and distinguishes it
from a time average of the corresponding instantaneous field.

<!-- Pages build only: github.com strips this tag and renders the math fences
     natively; on the Jekyll site math.js rewrites them for MathJax. -->
<script src="math.js" defer></script>
