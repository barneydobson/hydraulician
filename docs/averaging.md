# Time averaging: the Average mode

**Average** (VIEW → **A** on the strip, the `A` key, or the Controls panel's
*Average the flow* row) is a measurement mode, not a blur filter. While it is
on, the solver keeps running and accumulators collect the flow: the colour,
the free-surface line, the channel overlay, the particle tracers and every
instrument — probe, gauges, rake, flux sections, control volume — describe
**one averaging window**, so a screenshot never mixes two flow states. No
simulation pass reads an accumulator — switching Average on or off cannot
alter the solution.

Switching Average on also switches the particle tracers on: they are advected
by `û`, so over a mean picture they draw the mean flow's paths — for a steady
mean, its streamlines. Dye is the one live tracer with no accumulator, so it
stands down while a window is open and returns with Live.

Two principles fix everything below:

1. **The mean satisfies the solver's own discrete conservation law**, not a
   continuum approximation to it: conservation diagnostics use the numerical
   flux the VOF pass actually advanced (§1, §5).
2. **The interface may smear in storage, but is reassembled on readout**: the
   stored mean fill describes where the surface spent the window, and the
   displayed surface and reported depths are reconstructed from it (§7).

The legend card shows the elapsed window `T` and, under the cursor, the mean
fill `f̄`, the equivalent water depth `d̄`, the aeration gap `δ_a` and the
surface standard deviation `σ_η` — printed on the card in plain words (fill,
depth, gap, spread); the symbols live here and in [notation.md](notation.md). The conservation residual of §5 and the
1D/2D depth cross-check of §7 are not on the card — each needs full-field
readbacks far too slow for a per-frame readout — and are available on demand
as `APP.avg.residual()`.

---

## 1 · What the solver conserves

From [numerics.md](numerics.md): in the heavy-fluid limit the fill fraction
*is* the density, and the VOF pass advances a discrete flux-form update — a
van Leer face reconstruction, an interface-compression flux, and a donor-cell
positivity limiter:

```math
f^{m+1}_{ij} = f^{m}_{ij} - \frac{h_m}{\Delta x}\Bigl[(F^{E}-F^{W}) + (F^{N}-F^{S})\Bigr]^{m}_{ij}
```

**The cell-centred product `f u` is not this flux**: the face reconstruction
and the compression term cannot be written as fluid travelling at the
displayed velocity. That is why display and conservation use separate
accumulators (§4).

Updates the pass applies *after* the flux divergence — the relaxation sponges
at level-controlled edges (see
[boundary-conditions.md](boundary-conditions.md)), the two point sources, and
the range safety clamps — enter the balance as a source term `S`. Both
neighbours of a face compute the identical flux, so each interior face has one
well-defined value; the ghost ring supplies boundary state, and flux through
its inner faces is boundary exchange.

---

## 2 · Why not a wet-cells-only average

Averaging the velocity only over the moments a cell is wet does not recover
the fill-weighted transport (`γ ū ≠ ⟨f u⟩` — the difference is the
correlation between fill and velocity), and it hangs the result on an
arbitrary wet/dry threshold. Weighting by `f` itself does the same job
continuously: a frame in which the cell held air contributes `f ≈ 0` and
cannot drag the mean toward zero.

---

## 3 · The Favre average

Since `f` is the density, the velocity Average stores is the density-weighted
(**Favre**) mean:

```math
\bar{f} = \langle f \rangle, \qquad
\hat{\mathbf{u}} = \frac{\langle f\,\mathbf{u}\rangle}{\langle f\rangle}
```

with `⟨·⟩` a plain time average over the window — no conditioning, no
threshold. `û` is the physical mean velocity and is what every velocity-based
field displays (§6).

`û` is a display quantity, not a conservation certificate: it is sampled at
cell centres once per frame, while the conserved transport is the per-substep
face flux of §1. The two are accumulated separately (§4).

**Every instrument measures the mean flow while Average is on** — probe,
gauges, rake, flux sections, control volume, tracers all read `(f̄, û, ŵ, p̄)`
or the mean columns. The window is the instrument's aggregate, so no second
filter sits on top of it; in Live mode the same instruments smooth their
instantaneous samples over about a second instead, and switching modes
restarts the reading in both directions. One caveat carries over from the
physics: a *nonlinear* budget computed from mean values — a momentum flux, an
energy flux — is the budget **of the mean flow**, and the Favre fluctuation
stress `⟨f u″u″⟩` is not in it. A force balance that closes on the live flow
can therefore show a gap under Average near a jump or a jet; the gap is the
fluctuations' contribution, not an error.

---

## 4 · Three accumulators

| Product | Accumulated | Cadence | Answers |
| --- | --- | --- | --- |
| **Favre display** (§4.1) | `f`, `f u_c`, `f w_c`, `p/ρ_w` | per frame | mean-flow display fields |
| **Exact transport** (§4.2) | `F^E`, `F^N`, source rate | per substep | discrete mass balance |
| **Column and overlay** (§4.3) | `d`, `q`, `η`, `M₂` of `η` | per frame | reported measurements and channel overlay |

### 4.1 The Favre display accumulator — `nx × nz`

One full-grid buffer, advanced once per frame, storing running means of

```math
\bigl(\overline{f u_c},\; \overline{f w_c},\; \bar f,\; \overline{p/\rho_w}\bigr)
```

from which `û = \overline{f u_c}/\max(\bar f, ε)` and `ŵ` likewise. Velocity
is interpolated from the staggered faces to the cell centre *before* being
weighted by `f`, exactly as the live column reduction does. Pressure is
Reynolds-averaged, not Favre-averaged, because it is read as `−∇p̄`; the
stored channel is kinematic pressure `p/ρ_w`, so pressure head is that
channel divided by `g` — never divided by density a second time.

This accumulator serves the colouring, the heads, the excursion band, the
particle advection and every instrument readback (§3). The instruments unpack
it into the live layout — `û` at cell centres, so face samples average the
two adjacent centres rather than reading the staggered offsets.

### 4.2 The exact transport accumulator — per substep

The VOF pass writes a second output: the face fluxes it has just computed,
and the source rate, as running means —

```math
\bigl\langle F^{E}\bigr\rangle,\quad
\bigl\langle F^{N}\bigr\rangle,\quad
\bigl\langle S \bigr\rangle, \qquad
S^m = \frac{f_{\mathrm{final}}^{m+1}-f_{\mathrm{cons}}^{m+1}}{h_m}
```

where `f_cons` is the purely conservative update of §1 and `f_final` is the
fill after sponges, sources and clamps. `S` is a **rate** (fill per second):
everything non-conservative the pass does is captured in it, so the balance
of §5 holds in every interior cell, source or not. Each interior face is
stored once (a cell owns its east and north faces); the left and bottom
boundary fluxes are held by the ghost texels, computed by the same expression
the interior neighbour uses. Solid cells pass their accumulator through
unchanged.

### 4.3 The column and overlay accumulator — `nx × 1`

The per-column reduction already runs every frame and already resolves
nappes, spray, soffits and perched pools by walking the *connected* wet run
on the sharp instantaneous field. Average accumulates its **output**:

```math
\bigl(\bar d,\; \bar q,\; \bar\eta,\; M_2^{\eta}\bigr)
```

giving `⟨d⟩`, `⟨q⟩`, `⟨η⟩` and `σ_η = √(M₂/T)`. Connectivity is decided on
each instantaneous field before its scalars are averaged, never on the mean
(§7.2).

These are the **authoritative readings**. `⟨d⟩` and `⟨q⟩` are geometric,
built on `min(f,1)` — what a flume measures — deliberately distinct from the
conserved `f` balance, whose slot excess is storage but not geometric water.
`⟨η⟩` is where the surface line is drawn; the conservation claim belongs to
`⟨d⟩`, an integral.

**The channel overlay consumes the mean columns too.** While Average is
active, the overlay's `d`, `d_c`, `d_n`, `V`, `Fr`, energy grade line,
profile class and jump boxes are all derived from the mean column buffer
`C̄ = (z_b, d̄, q̄, η̄)` — so `d_c = (q̄²/g)^{1/3}` and friends are quantities
*of the mean column*, and the jump boxes agree with the plotted profile. No
overlay quantity falls back to the live columns while Average is on. The
overlay's live-mode spatial prefilters and temporal EMAs are bypassed —
applying them to `C̄` would average twice and broaden the mean jump — and its
temporal estimates are reset on every switch between Live and Average, so
neither mode inherits the other's state.

### 4.4 Sampling and online statistics

The display and column accumulators advance once per rendered frame, weighted
by the simulated time that frame actually advanced; the transport accumulator
advances every substep, weighted by the substep `h`. Weighting is by time,
not by sample count — frames advance unequal `Δt`, and a per-frame average
would bias toward the slow frames.

Everything is stored as **running means**,

```math
\bar\phi_{n+1} = \bar\phi_n + \frac{\Delta t_n}{T_n + \Delta t_n}\left(\phi_n - \bar\phi_n\right)
```

with a Welford second moment for the surface variance — forms that stay
accurate in 32-bit floats over arbitrarily long windows, where raw sums and
the naive `⟨η²⟩ − ⟨η⟩²` would not.

---

## 5 · The discrete mass balance

Telescoping the substep update over the window gives, in every interior cell,

```math
\boxed{\;\frac{f(T)-f(0)}{T}
\;+\; \nabla_h\!\cdot\!\left\langle \mathbf{F}\right\rangle
\;-\; \left\langle S \right\rangle \;=\; 0\;}
```

with `f(0)` copied when the window opens. Storage change, mean flux
divergence and mean source close exactly — in source cells as well as
source-free ones, because `S` carries the complete non-conservative
difference. Boundary exchange appears through the ring faces.

Two derived quantities:

- **A conservative transport discharge.** `Q̄_F = Δx Σ_j ⟨F^E⟩_{ij}` is
  constant between vertical sections of a steady, source-free reach. It
  includes the artificial interface-compression flux, and is therefore
  distinguished from the geometric discharge `q̄` of §4.3.
- **A display residual.** The same balance evaluated on `⟨f u_c⟩` instead of
  `⟨F⟩` does not vanish: it measures the gap between the display
  reconstruction and the conserved transport field, and it settles on a
  discretisation floor rather than shrinking with `T`.

The identity is exact in exact arithmetic; what a run reports is float32
rounding, which accumulates as a random walk. The transport residual
therefore **grows as `√T`**,

```math
\mathcal{R}_{\max}\;\lesssim\;C\,\varepsilon\,\bigl\lVert\langle F\rangle\bigr\rVert_\infty\,\frac{\sqrt{T/\Delta t}}{\Delta x},\qquad \varepsilon = 2^{-23},
```

and any tolerance on it must scale the same way — the conservation gate in
the test suite does. A genuinely broken flux sits orders of magnitude above
this bound. `APP.avg.residual()` computes the residual from the stored means
on demand.

---

## 6 · The fields, all derived from the mean state

Only `(f̄, û, ŵ, p̄)` is accumulated for display; each colouring is computed
from it by the same display-pass branch that draws it live:

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

One accumulator serves all seven fields, so changing the displayed field does
not restart the averaging window.

### What may and may not be claimed

`h` is linear in pressure and elevation, so `h̃ = h̄`: the piezometric head of
the mean flow *is* the mean piezometric head.

`ω̃` is the vorticity of the Favre mean. It equals the mean vorticity where
`f` is steady across the stencil; elsewhere the two differ through
fill–velocity correlation.

`H`, `Fr` and `m` are nonlinear: each is the field **of the mean flow**, not
the time average of the instantaneous field. For the energy head the
difference is the unresolved fluctuation energy,

```math
\bar H-\widetilde H
= \frac{\langle|\mathbf u|^2\rangle-|\hat{\mathbf u}|^2}{2g},
```

which is not stored. The legend therefore labels `H̃`, `Fr̃` and `m̃`
**"from the mean flow"** — quote them as properties of the mean flow, not as
mean properties of the flow.

---

## 7 · Putting the surface back

### 7.1 Compaction is a closed form, not an iteration

Storing `f̄` distributes the interface across the band the surface moved
through, and a full column under gravity holds a little more than `f = 1` of
slot storage — `g d/2c²` of it, 0.78% at `c = 25` and 7.7% at the celerity
slider's low end. Integrating raw `f̄` would overread the depth by exactly
that, so reconstruction first removes the compressible excess. The EOS gives
the identity

```math
\min(f,1) \;\equiv\; f - \frac{P_{\mathrm{EOS}}}{c^{2}},
```

so the stored mean fill and mean pressure yield an approximate geometric fill

```math
\bar g_{\mathrm{diag},ij}
= \operatorname{clamp}
  \left(\bar f_{ij}-\frac{\bar P_{ij}}{c^2},0,1\right),
\qquad
\bar{d}^{\,\text{2D}}_i
= \Delta x \sum_{j\in\text{body}}
  \bar g_{\mathrm{diag},ij}
```

— *approximate* because the stored pressure is the diagnostic channel, which
lags the fill by one substep and carries the wave-damping term. §4.3's `⟨d⟩`
is therefore the authoritative depth; the 2D reconstruction is a diagnostic
cross-check, reachable through `APP.avg.residual()`.

The `g = 0` scene is excluded by construction: its EOS is two-sided, its
pressure can be negative, and it has no free surface to reconstruct.

### 7.2 Connectivity must not be decided on the mean

Time averaging does not preserve connectivity: a nappe that touches a pool
for part of the window leaves mean fill all the way between them, so a
connectivity test on the mean would join bodies that were never joined at any
instant. The column readings avoid this entirely — §4.3 walks the connected
run on each instantaneous field and averages the result. The 2D cross-check
applies the same fixed rule to `ḡ_diag` (start at the lowest open cell above
threshold, tolerate at most two dry cells, stop at a solid); a discrepancy
between `d̄²ᴰ` and `⟨d⟩` beyond tolerance is the signature of connectivity
introduced by averaging.

### 7.3 The line is the mean; the band is the level sets

The displayed surface line sits at `η̄ = ⟨η⟩`, the mean position of the
visible surface.

Where the interface is sharp, `f̄(z)` is the fraction of the window the
surface stood above `z` — an exceedance function — so the level sets of `f̄`
are the percentiles of `η`:

```math
\bar f = 0.05 \iff z = \eta_{95}, \qquad
\bar f = 0.95 \iff z = \eta_{05}
```

**`f̄ = 0.05` is the high edge.** The translucent band `0.05 ≤ f̄ < 0.95` is
the 5th-to-95th percentile range: the surface spent 90% of the window inside
it. `σ_η` from §4.3 is an independent estimate of the same excursion.
Colour is drawn where `f̄ ≥ ½`, the band where `0.05 ≤ f̄ < 0.95`, nothing
where `f̄ < 0.05`.

In an aerated or intermittently connected column, mean level and equivalent
water depth are different objects, and Average reports both rather than
choosing: the line stays at `η̄`, the depth readout is `d̄`, and the signed gap

```math
\delta_{\mathrm{a},i}
= \bar\eta_i-\left(z_{b,i}+\bar d_i\right)
```

is printed with them — the **aeration / partial-fill gap**, positive for void
held below the surface line, zero where line and depth agree. The identity
`η̄ − z_b = d̄ + δ_a` makes the two readings explicit. `δ_a` is shown wherever
the cursor is, so a zero is itself the statement that the column is simple.

---

## 8 · How this is verified

The reconstruction numerics are a pure function with no WebGL in it
(`RECON`, `js/reconstruct.js`), so most of the above is pinned by closed-form
tests. The battery is organised in groups: **A** accumulator arithmetic,
**B** compaction and compressibility, **C** surface statistics on a wobbling
surface with known answers, **D** jets and connectivity, **E** geometry,
**F** end-to-end conservation on the GPU, **G** float32 robustness, **H**
overlay consistency. Groups A–E and G live in `node test/recon-test.mjs`;
`node test/mutation-test.mjs` proves those tests can fail; groups F and H run
on the GPU in `node exercises/_runner/smoke.js --only=avg`, which gates the
transport residual on the window-scaled bound of §5 — in the source-free
interior (F1) and in the `⟨S⟩ ≠ 0` population (F4: the sponge, the Dirichlet
bands and every clamp event, counted rather than silently excluded; its
drift does not follow the √T law cleanly, so it is gated on separation from
the source scale instead).

---

## 9 · Reset conditions

All three accumulators are zeroed, `T ← 0`, and `f(0)` re-copied, on:

- switching Average on;
- `R` / `resetWater`;
- any geometry edit — drawing, undoing or clearing walls;
- **anything that opens or closes an edge**, under Controls → Flow or
  → Boundaries: the per-edge Wall / Open / Outfall selects, and the Upstream
  reservoir and Tailwater control toggles, which open their edge when
  switched on and close it again when switched off. An edge is a wall of the
  control volume, so changing one ends the window that was accumulating
  across the old one. These read as settings rather than edits, which is why
  the legend card names them among the reset conditions;
- a **valve toggle** — it reclassifies every valve cell between solid and
  open, which changes the set of cells being averaged;
- a **celerity change** — it rewrites `f` in place to keep the pressure
  field, which invalidates `f(0)` and the compaction of §7.1;
- a scene change, and the rebuild a resolution change performs;
- the end of spin-up, which is initialisation rather than reported flow.

Switching between Live and Average also restarts every instrument's reading
in both directions (§3): an Average window must not open on a live estimate,
and Live must not resume from a window mean.

While paused, no time passes: accumulators and `T` hold, and the window
resumes with the clock.

No convergence time is imposed — how long a window needs is set by the flow
being measured, and several scene timescales are emergent. `T` on the legend
card is the number to quote with any averaged reading.

---

## 10 · Cost

The two full-grid accumulators cost about 22 MB apiece at Ultra resolution,
plus a tiny column buffer and one copy of `f(0)`. Everything is allocated
when Average is switched on and released when it is switched off; a session
that never opens Average pays nothing. The transport accumulator adds one
texture read and write per cell per substep — only while Average is active.

---

## Notation

Symbols follow [notation.md](notation.md): depth `d`, level `η`, piezometric
head `h = z + p/ρg`, energy head `H`, velocity `u = (u, w)` with `w` the
vertical component, `z` the domain vertical, pressure head always spelled
`p/ρg`. New here: `⟨·⟩` and an overbar for a time average over the window,
`^` for a Favre (fill-weighted) average, `F` the limited VOF face flux, `S`
the post-advection source rate, `P_EOS = p_EOS/ρ_w` the bare kinematic EOS
pressure, `T` the averaging-window duration, `M₂` the Welford second moment,
`σ_η` the surface standard deviation, and `𝓡` the conservation residual of
§5. A tilde marks a field computed from the mean state and distinguishes it
from a time average of the corresponding instantaneous field.

<!-- Pages build only: github.com strips this tag and renders the math fences
     natively; on the Jekyll site math.js rewrites them for MathJax. -->
<script src="math.js" defer></script>
