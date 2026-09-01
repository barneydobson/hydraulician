# Polygon geometry and surface pressure forces — design

Date: 2026-09-01 · Branch: `polygon-geometry` (off `main` @ 6cc91ca)

## Why

Two capabilities the segment representation cannot deliver:

1. **Parametric shapes.** A slider that raises a hump or lowers a gate needs
   geometry that is a *function of parameters*, re-rasterised on change.
   Today a scene's `walls()` closure is fixed at build time.
2. **Pressure forces on surfaces.** Showing the pressure distribution on a
   wetted face — and its resultant — needs the face to exist as an object
   with identity, outward normals and extent. A capsule-stamped mask has no
   faces; a curved surface (Tainter gate, ogee, hump) needs to be *one*
   selectable thing, not a pile of segments.

## Decisions taken (with the user, 2026-09-01)

- Polygons become the **core primitive**; segments survive as a builder
  (`GEOM.slab`) and as the user drawing tool. Scenes migrate incrementally.
- Curved surfaces are **polyline-sampled at build time** with **face
  identity** — no arc primitive in the rasteriser.
- The force instrument shows **distribution + resultant** (centre of
  pressure, kN per m width, Fx/Fz components).
- First demos: **sluice gate opening** (convert `s3`) and **hump height**
  (new scene, curved crest). Tainter gate is a follow-up, not this branch.
- Rig wire format **stays at v2** with an additive optional `params` key.
  The v3 bump approved at first was wrong on the codebase's own evidence,
  found during planning: `js/rig.js` documents (and its `flux`/`ui.cvShow`
  precedent establishes) that a purely additive optional key does NOT bump
  `V` — only a rename/redefinition does — and `check_notation.py`
  cross-checks `V` against the 26 v2 payloads in `js/exercises-rigs.js`,
  which are Linux-bound CDP captures. A bump would fail CI and cost the
  teaching pack for zero benefit. A rig without `params` loads scene
  defaults; an old build ignores the key. Both directions degrade to the
  truth, which is exactly the documented test.

## 1. Geometry model — `js/geom.js` (`GEOM`)

New classic script, loaded before `sim.js`. **No WebGL in it** (the RECON
pattern), so it gets browser-free unit tests.

A **solid**:

```js
{ id: "gate",                      // unique within the scene
  verts: [[x,z], ...],             // closed polygon, metres, CCW
  faces: [{ id: "us", label: "Upstream face", e0: 3, e1: 7 }, ...] }
```

Edge `i` runs `verts[i] → verts[(i+1) % n]`. A face is a run of consecutive
edges `[e0..e1]` (wrapping allowed). Every edge belongs to at most one named
face; unnamed edges are still solid boundary, just not selectable. CCW
winding makes the outward normal of edge `(t)` the quarter-turn `(tz, -tx)`
— one convention, asserted by the tests.

Builders (all return solids):

- `GEOM.slab(x0, z0, x1, z1, th, opts)` — the butt-ended thick segment as an
  exact 4-gon: same centreline and butt-end contract as `stampSeg`, so a
  converted scene keeps its measured geometry. Long faces auto-named
  `top`/`bottom` unless `opts.faces` overrides.
- `GEOM.rect(x0, z0, x1, z1, opts)` — axis-aligned box.
- `GEOM.poly(verts, faces, id)` — raw.
- Curve samplers, emitting a vertex run tagged as ONE face:
  `GEOM.arcPts(cx, cz, r, a0, a1, n?)` and
  `GEOM.humpPts(x0, x1, h, n?)` (cosine bump). Default sampling `n` is
  chosen from arc length so the Δx rasteriser cannot tell (segment sagitta
  < Δx/4 at the finest grid budget).
- Geometry queries the instrument needs: `GEOM.faceAt(solids, x, z, tol)`
  (nearest face within tol), `GEOM.faceSamples(solid, face, ds)` (points +
  outward normals along the face polyline).

## 2. Rasterisation and the shim — `js/sim.js`

`rasterise()` gains `stampPoly(mask, solid, value)` beside `stampSeg`:
point-in-polygon test per cell centre inside the solid's bounding box
(even–odd rule). After the fill, every boundary edge is stroked at the
existing `max(0, dx·1.7)` minimum width via the `stampSeg` capsule walk —
the same anti-leak guarantee thin walls have today, restated for polygons.

Source order per rebuild, unchanged in spirit:

1. Scene solids: `sc.solids ? sc.solids(W, H, P, S.params) : segs-via-shim`
   — a scene with only `walls()` is wrapped seg-by-seg through `GEOM.slab`,
   so **all scenes run unchanged on day one** and migration is per-scene.
2. Scene valves (still segments, value 128).
3. User-drawn `S.segs` (wrapped through `GEOM.slab` at stamp time; stored
   and serialized as segments, untouched).
4. The closed outer ring, stamped last, as ever.

`S.solids` (the resolved list for the current param values) is kept on state
for the instrument and the overlay to read. `rasterise()` already resets
averaging and invalidates bands — the choke point covers sliders for free.

## 3. Parametric shapes — sliders

A scene may declare:

```js
params: [{ key: "a", label: "Gate opening", min: 0.10, max: 0.80,
           step: 0.01, value: 0.35, unit: "m" }]
```

`S.params` holds live values (`{key: value}`), seeded from the declaration
and reset by scene load. `SIM.setParam(key, v)` updates and calls
`rasterise()` (throttled to one rebuild per frame; slider input events can
outrun rAF). The CONTROLS panel spec in `main.js` grows a **Geometry**
section, rendered only when the scene has params — self-configuring like
every other section, and an exercise's `ui` profile can focus it.

A solid stamped over wet cells behaves exactly as drawing a wall over water
does today (the mask wins; VOF flux caps handle the rest) — no new
mechanism, but the smoke test pins it (lowering the gate into flow must not
create volume).

### Wire format: v2 + additive `params`

`RIG.V` stays 2. `snapshot()` writes `params: {key: value}` only when the
scene declares params; `apply()` reads it if present and otherwise leaves
scene defaults. Additive-optional, per the documented rule in `js/rig.js`
(the `flux` / `ui.cvShow` precedent): a missing key and an unknown key both
degrade to the truth, so no bump — and no re-capture of the 26 v2 exercise
payloads `check_notation.py` guards. The smoke rig round-trip gains params.

## 4. The pressure-force instrument

### Sampling — `SIM.faceForce(solidId, faceId, avg)`

One full-texture readback (the `lineFlux` bargain — click-rate, never
frame-rate), then for each face sample (spacing ~Δx along the polyline,
never fewer than 8): step `0.75·Δx` along the outward normal, bilinear-read
`p` and `f` there. Every term carries the fill fraction — air contributes
zero, no threshold, exactly the `lineFlux` rule. Under Average it reads the
mean field: one window, like every instrument (docs/averaging.md contract).

Returns per metre width:

```js
{ samples: [{x, z, nx, nz, p, f}], Fx, Fz, F,   // ∮ p n ds, N/m
  cop: {x, z},                                   // centre of pressure
  wetLen, len }
```

Centre of pressure from the moment balance `∮ p (r × n) ds = r_cop × F`
(solved along the face; for a straight face this is the textbook first/second
moment ratio). Signs: force ON the surface, so the arrows and F point along
`−n` when p > 0.

Exposed as `APP.faceForce` for headless tests; notation additions (`F`,
centre of pressure) go in `docs/notation.md`.

### The tool

`["force", "Pressure force", ...]` **appended to the end of `TOOLS`** — no
digit (1–9 are taken; the appended-tool rule in main.js), MEASURE family on
the strip, its own stroke icon. Click near a solid selects the face under
the cursor (`GEOM.faceAt`); clicking the same solid again cycles its named
faces; clicking empty water clears. One face selected at a time (like the
control volume). Sampled at the instrument throttle, not per frame.

### The drawing — `js/overlay.js`

- **Distribution**: arrows normal to the face pointing onto it, length ∝
  local `p/ρg`, tips joined into a translucent filled pressure diagram —
  the textbook trapezoid on a plane face, the lens on a curved one, drawn
  along the whole face. Arrow scale fitted to the face's max head, printed
  on the readout so the picture stays quantitative.
- **Resultant**: one heavier arrow through the centre of pressure, labelled
  `F = … kN/m`, with `Fx`/`Fz` beneath — on a curved face that is the
  horizontal/vertical decomposition the textbooks construct.
- Screen mapping through the view transform (`V.X/V.Y`) like every overlay
  element; vertical exaggeration bends the drawn normals, which is already
  true of every on-screen direction and stays honest because the numbers
  are printed.

## 5. Demos on this branch

1. **`s3` converted**: bed slabs and gate become solids; gate gains
   `params: [{key:"a", …}]` replacing the fixed `gate.a = 0.35`; its
   upstream face is named for the instrument. The scene's measured numbers
   (bed0, S0, q, spinup) do not move; smoke.js must stay green on it.
2. **`hump` (new scene)**: the m1/m2 mild channel carrying a cosine hump
   mid-reach, `height` slider 0 → 0.45 m (past choking at this q). The
   crest is one curved face — the curved-surface pressure demo. Blurb/tips
   teach specific energy and choking; `spinup` measured before shipping,
   per the standing rule.

## 6. Testing

- **`test/geom-test.mjs`** (new, browser-free, wired into
  `.github/workflows/checks.yml`): winding/normal convention; slab⇄stampSeg
  cell equivalence on a synthetic grid; point-in-polygon edge cases (vertex
  on cell centre, horizontal edges); face sample normals on an arc;
  hydrostatic closed form — synthetic still-water p field vs a vertical
  face must integrate to ½ρgH² and put the CoP at H/3, to numerical
  tolerance.
- **`smoke.js`** additions: `APP.faceForce` on a still tank wall within a
  few % of ½ρgH²; `setParam` rebuilds the mask and resets averaging;
  gate-into-flow conserves volume (no invented water); converted `s3` and
  new `hump` pass the existing per-scene physics gates; the v2 rig
  round-trip carries params.
- **`ui-smoke.mjs`** additions: the Force tool appears in the MEASURE strip
  family; the Geometry panel section renders exactly when the scene has
  params; an exercise `ui` profile can expose/withhold the tool.
- Docs: polygon contract, face identity, thin-polygon stroke guard and the
  params-stays-v2 reasoning recorded in `docs/engineering-notes.md`; force symbols in
  `docs/notation.md`; `check_notation.py` taught any new reserved names.

## Out of scope (follow-ups, not this branch)

- Migrating the remaining scenes off `walls()` and deleting `stampSeg`'s
  scene path (the shim stays until then).
- Tainter-gate scene and Fv-as-weight-of-water overlay construction.
- Polygon *drawing* tools for users (drawn edges stay segments).
- Sub-cell solid fractions in the mask (stays binary).

## Execution

Implementation planned with the writing-plans skill; tasks executed by
Sonnet subagents with the relevant gates run between tasks
(`geom-test` + `check_pack`/`check_notation` instantly; `smoke.js`
subsets and `ui-smoke.mjs` at integration points).
