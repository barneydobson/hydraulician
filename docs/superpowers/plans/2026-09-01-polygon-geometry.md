# Polygon Geometry + Surface Pressure Forces Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make polygons the core geometry primitive (slider-driven parametric shapes, per-scene) and add a pressure-force instrument that shows the distribution and resultant on any named wetted face, curved faces included.

**Architecture:** New browser-free `GEOM` module (polygon solids with named faces, builders, samplers, force integration) tested like `RECON`; `SIM.rasterise` fills polygons beside the existing segment stamp with a seg→slab shim so all scenes keep working; scene `params` drive re-rasterisation from a new Geometry panel section; `SIM.faceForce` samples the pressure field along a face and `OVERLAY.drawForce` draws the textbook diagram.

**Tech Stack:** Zero-dependency classic scripts, WebGL2 readbacks, Node 22+ vm-based unit tests, CDP browser gates.

**Spec:** `docs/superpowers/specs/2026-09-01-polygon-geometry-design.md` (committed on this branch — read it first; it records the decisions and their reasons).

## Global Constraints

- **Zero dependencies, classic scripts** — no ES modules, no fetch, no build step, in `index.html` / `js/*` / `css/*` (AGENTS.md; the app must boot from `file://`).
- **Notation** — vertical is `z`, vertical velocity `w`, depth `d`, pressure head spelled `p/ρg`; new public API fields follow it (AGENTS.md, docs/notation.md).
- **Rig wire format stays v2** — `params` is an additive optional key; do NOT change `const V = 2;  // format version` in js/rig.js (check_notation.py cross-checks it against the 26 v2 payloads in js/exercises-rigs.js).
- **VOF/vel-pass rules untouched** — nothing in this plan edits js/shaders.js physics passes.
- **Geometry contracts** — butt ends, slabs extrapolated past the domain, bed above z = 0, ground solid all the way down, outer ring stamped last (AGENTS.md).
- **Every commit message ends with** `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- **Instant gates must stay green after every task:** `python3 exercises/_runner/check_pack.py && python3 exercises/_runner/check_notation.py && node test/recon-test.mjs && node test/mutation-test.mjs` (run from the repo root; on this Windows machine `python` may be the spelling — try `python3` first).
- Working directory: repo root, branch `polygon-geometry`.

---

### Task 1: GEOM core module + unit tests

**Files:**
- Create: `js/geom.js`
- Create: `test/geom-test.mjs`
- Modify: `index.html` (one script tag, before `js/sim.js` at line ~161)
- Modify: `.github/workflows/checks.yml` (one step after recon-test.mjs)
- Modify: `docs/engineering-notes.md` (new section, at the end)

**Interfaces:**
- Consumes: nothing (pure JS, no WebGL, no DOM — the RECON pattern; `js/reconstruct.js` is the style reference).
- Produces (all under the global `GEOM`, classic-script IIFE `const GEOM = (() => { ... })();` with `"use strict";` at the top of the file):
  - `GEOM.poly(verts, faces, id)` → solid `{id, verts: [[x,z],...], faces: [{id, label, e0, e1}]}`. Verts CCW; edge `i` runs `verts[i] → verts[(i+1) % n]`; a face is the consecutive edge run `e0..e1` inclusive (wrap allowed, `e0 > e1` means it wraps past the last vertex).
  - `GEOM.slab(x0, z0, x1, z1, th, opts)` → the butt-ended thick segment as a 4-gon. Centreline `(x0,z0)→(x1,z1)`, half-width `th/2` perpendicular to it, corners exactly at the butt ends. Vertex order (t = unit tangent, m = unit left-normal `[-tz, tx]`): `A = p0 + m·th/2`, `B = p0 − m·th/2`, `C = p1 − m·th/2`, `D = p1 + m·th/2`, emitted in CCW order `[B, C, D, A]`. Default faces: `{id:"top"}` on edge D→A side... concretely: faces `[{id:"side1", e0:3, e1:3}, {id:"side0", e0:1, e1:1}]` where side1 is the +m side (the top of a horizontal slab) and side0 the −m side. `opts = {id, faces}` overrides.
  - `GEOM.rect(x0, z0, x1, z1, opts)` → axis box, CCW `[[x0,z0],[x1,z0],[x1,z1],[x0,z1]]`, default faces `left/right/top/bottom` by edge.
  - `GEOM.arcPts(cx, cz, r, a0, a1, n)` → `[[x,z],...]` sampled from angle a0 to a1 (radians, CCW positive), n+1 points; default `n = max(8, ceil(|a1−a0|·r / 0.02))` (sagitta ≪ the finest Δx ≈ 2.6 mm).
  - `GEOM.humpPts(x0, x1, h, zb, n)` → cosine bump crest points left-to-right: `z = zb + h/2·(1 − cos(2π·(x−x0)/(x1−x0)))`... NO — a full cosine returns to zb at both ends but the classic bump is `z = zb + h·½(1+cos(π·(2t−1)))`-style; use `z = zb + h · sin²(π t)`, `t = (x−x0)/(x1−x0)`, n+1 points, default `n = max(16, ceil((x1−x0)/0.02))`. (sin² is the standard smooth hump: zero value AND zero slope at both ends.)
  - `GEOM.edgeNormal(solid, i)` → outward unit normal of edge i for a CCW polygon: with tangent `t = (verts[i+1] − verts[i])/|…|`, the outward normal is `[tz, −tx]`.
  - `GEOM.contains(solid, x, z)` → even–odd point-in-polygon (ray cast toward +x, the classic `(zi > z) !== (zj > z)` crossing test).
  - `GEOM.faceEdges(solid, faceId)` → array of edge indices for the face (resolving wrap).
  - `GEOM.faceSamples(solid, faceId, ds)` → `[{x, z, nx, nz, s}]` along the face polyline at spacing ≤ ds (at least 2 per edge, at edge-relative positions `(k+0.5)/nk`), `s` the arc-length coordinate, normals from `edgeNormal`.
  - `GEOM.faceAt(solids, x, z, tol)` → `{solid, faceId, dist}` for the nearest named face within `tol` (point-to-segment distance over each face's edges), or `null`.
  - `GEOM.faceForceFromSamples(samples, ds, rho, g)` → `{Fx, Fz, F, cop, wetLen}` where each sample has been given `p` (pressure, m²/s² units as the solver stores it: P = p/ρ) and `f` (fill). Force ON the surface per metre width: `Fx = −Σ min(f,1)·ρ·p·nx·ds`, `Fz` likewise (minus because pressure pushes along −n). `wetLen = Σ ds` over samples with `min(f,1)·p > 0`. Centre of pressure: solve `Σ (r_i × dF_i) = r_cop × F` in 2D — with `M = Σ (x_i·dFz_i − z_i·dFx_i)`, pick the point on the face polyline closest to the line of action `{x·Fz − z·Fx = M}`; implement by scanning the samples for the one minimising `|x_i·Fz − z_i·Fx − M|` and returning `{x, z}` of that sample (exact enough at Δx spacing, and always ON the face, which is where the arrow must be drawn). Return `cop: null` when `F < 1e-9`.

**Steps:**

- [ ] **Step 1: Read the references.** Read `js/reconstruct.js` (module shape, comment style), `test/recon-test.mjs` (vm loader, `ok`/`near` helpers), the spec §1, and AGENTS.md's notation rules.

- [ ] **Step 2: Write the failing tests** in `test/geom-test.mjs`, using the exact recon-test.mjs vm pattern (`vm.runInContext(src + "\n;globalThis.GEOM = GEOM;", ctx)`, reading `../js/geom.js`; no `GEOM_SRC` env override needed). Test groups, each a closed-form answer:

```js
// G1 slab: a horizontal slab's 4 corners are exact (butt ends).
//   GEOM.slab(0, 1, 4, 1, 0.5) has verts (in some rotation) {0,0.75},{0,1.25},{4,0.75},{4,1.25}
// G2 winding/normal: for GEOM.rect(0,0,2,1) every edgeNormal points away from (1,0.5):
//   dot(normal_i, midpoint_i − centre) > 0 for all 4 edges.
// G3 contains: rect(0,0,2,1) contains (1,0.5), not (3,0.5), not (1,1.5);
//   a point just inside a slanted slab GEOM.slab(0,0,3,3,0.5) at (1.5,1.5) is contained.
// G4 arcPts: quarter arc r=2 about origin, a0=0, a1=π/2 — first point (2,0),
//   last (0,2) to 1e-9; polyline length within 0.1% of π (=2·π/2).
// G5 humpPts: endpoints at zb exactly, midpoint at zb+h exactly, symmetric,
//   and end SLOPES ~0: |z[1]−z[0]| < h·1e-3 for n = 200.
// G6 faceSamples on the rect's "left" face: all normals (−1, 0), s increasing,
//   spacing ≤ requested ds.
// G7 faceAt: on rect(0,0,2,1) the point (−0.05, 0.5) with tol 0.2 finds "left";
//   (5,5) with tol 0.2 finds null.
// G8 hydrostatic closed form: a vertical face from z=0 to z=2 (rect(0,0,1,2)'s
//   "left" face), samples given p = g·(H−z) (units m²/s², i.e. already /ρ)
//   and f = 1 below z=H with H=2, ds from the sampler. faceForceFromSamples
//   with rho=1000, g=9.81 must give Fx = +½·1000·9.81·4 = 19620 N/m within
//   0.5% (outward normal is −x, pressure pushes along +x), Fz ≈ 0, and
//   cop.z = H/3 ± 0.02.
// G9 wrap: a face {e0: 3, e1: 0} on a 4-gon resolves to edges [3, 0].
```

Write ~20 `ok(...)` assertions implementing exactly the cases above (compute expected values inline; no fixtures).

- [ ] **Step 3: Run to verify failure.** `node test/geom-test.mjs` — expected: throws (`js/geom.js` missing).

- [ ] **Step 4: Implement `js/geom.js`** to the interface above. Header comment in the repo's voice: what a solid is, the CCW/outward-normal convention, why faces are runs of consecutive edges, why there is no WebGL in the file (unit-testable, the RECON pattern). Keep it under ~250 lines.

- [ ] **Step 5: Run tests.** `node test/geom-test.mjs` — expected: all pass, non-zero exit on failure (copy recon-test's exit-code tail: `process.exit(failures.length ? 1 : 0)` with a summary print).

- [ ] **Step 6: Wire in.** `index.html`: add `<script src="js/geom.js"></script>` on the line before `<script src="js/sim.js"></script>`. `.github/workflows/checks.yml`: after the recon-test step add

```yaml
      - name: geom-test.mjs — GEOM's closed-form answers
        run: node test/geom-test.mjs
```

- [ ] **Step 7: Document.** Append a short section to `docs/engineering-notes.md` (match its heading style — grep `## ` there first): "Polygon geometry" — the CCW/outward-normal convention, faces as consecutive-edge runs, why curves are polyline-sampled (sagitta < the finest Δx), and that `test/geom-test.mjs` holds the closed forms.

- [ ] **Step 8: Run the instant gates** (see Global Constraints) — all four existing plus the new one must pass.

- [ ] **Step 9: Commit.** `git add js/geom.js test/geom-test.mjs index.html .github/workflows/checks.yml docs/engineering-notes.md && git commit` — message: `A solid is a polygon with named faces: GEOM, its closed forms, and its gate` + the co-author line.

---

### Task 2: sim.js — polygon rasterisation, the seg→slab shim, and params state

**Files:**
- Modify: `js/sim.js` (rasterise ~lines 97–139, build, the export list ~line 1541)
- Test: browser verification via `node exercises/_runner/smoke.js --only=api,rig` (~2.5 min; needs the local GPU)

**Interfaces:**
- Consumes: `GEOM.slab`, `GEOM.contains`, `GEOM.edgeNormal` (Task 1).
- Produces:
  - A scene may declare `solids(W, H, P, params)` → array of GEOM solids (alongside or instead of `walls()`); and `params: [{key, label, min, max, step, value, unit}]`.
  - `S.params` — `{key: value}` live values, seeded from the scene declaration in `build()` (empty object when none).
  - `S.solids` — the resolved solid array for the current param values, rebuilt inside `rasterise()`; `[]` when the scene has none. User-drawn segs are NOT in it (they have no named faces).
  - `SIM.setParam(key, v)` → clamps to the declared min/max, writes `S.params[key]`, calls `rasterise()`. Returns the clamped value.
  - `SIM.params()` → `{decl, values}` — the scene's declaration array (or `[]`) and `S.params`.
  - `stampPoly(mask, solid, value)` — internal: even–odd fill of cell centres `((i+0.5)·dx, (j+0.5)·dx)` over the solid's bounding box via `GEOM.contains`, then every edge re-stamped through the existing `stampSeg` with `th = 0` (stampSeg's own `max(th, dx·1.7)·0.5` radius floor is the anti-leak stroke).

**Steps:**

- [ ] **Step 1: Read** js/sim.js lines 60–140 (stampSeg, rasterise, addSeg) and the `build()` function (grep `function build`), plus spec §2–3.

- [ ] **Step 2: Implement.** In `rasterise()`, replace the scene-walls line with:

```js
    const par = S.params || {};
    S.solids = sc.solids ? sc.solids(sc.W, sc.H, S.p, par) : [];
    if (S.solids.length) S.solids.forEach((so) => stampPoly(m, so, 255));
    // The shim: a scene still on walls() rasterises exactly as it always
    // has — same stampSeg, same capsule, same measured geometry.
    (sc.walls ? sc.walls(sc.W, sc.H) || [] : []).forEach((s) => stampSeg(m, s, 255));
```

(valves, user segs, border ring: unchanged, same order). Add `stampPoly` beside `stampSeg` with a comment on the two-part guarantee (fill decides ownership, the zero-width edge stroke seals sub-cell pinches). In `build()`, seed `S.params` from `scene.params` (`{}` when absent — and PRESERVE existing values across a resolution rebuild the way `wasAvg` is preserved: read how build() carries `S.segs` over and do the same). Extend the export list: `setParam`, `params`.

- [ ] **Step 3: Sanity-check in the browser.** Serve (`python3 -m http.server 8124` or `python -m http.server 8124`, background) and use the existing headless client: `node exercises/_runner/smoke.js --only=api,rig`. Expected: green (nothing uses solids yet; this proves the shim changed nothing).

- [ ] **Step 4: Prove stampPoly does something.** Temporary check via Node + CDP is overkill here; instead add the permanent smoke case now — open `exercises/_runner/smoke.js`, find the `api` section (grep `--only=api` / `case "api"` / how cases register), and add a check: on the sandbox scene, run

```js
// A slab and its polygon are the same wall: stamp GEOM.slab(2,2,5,2,0.4)
// via SIM's rasterise path and compare masks. Drive it with
// APP.sim/… — concretely: read S via APP.sim… (smoke.js already reaches
// SIM.get(); follow its existing pattern for mask access), build a scene
// object copy with solids: () => [GEOM.slab(2,2,5,2,0.4)] replacing
// walls: () => [[2,2,5,2,0.4]], rasterise both, assert the two masks
// differ in fewer than 1% of the cells either stamps solid.
```

Follow smoke.js's own assertion helpers (grep `function check` / `fail(` there) — this file has established patterns; copy them.

- [ ] **Step 5: Run it.** `node exercises/_runner/smoke.js --only=api,rig` — expected: green including the new case.

- [ ] **Step 6: Run the instant gates.**

- [ ] **Step 7: Commit.** Message: `rasterise fills polygons; walls() rides the slab shim; params live on S` + co-author line.

---

### Task 3: Geometry panel section + rig `params` key

**Files:**
- Modify: `js/main.js` (CONTROLS ~line 365–728, syncPanel ~line 806, loadScene/`state` if needed)
- Modify: `js/rig.js` (snapshot ~line 83, apply ~line 149)
- Test: `node exercises/_runner/smoke.js --only=api,rig` + `node test/ui-smoke.mjs`

**Interfaces:**
- Consumes: `SIM.setParam(key, v)`, `SIM.params()` (Task 2).
- Produces:
  - CONTROLS rows `geom0…geom3` under a `{ h: "Geometry" }` header (placed after the `{ h: "Flow" }` block, before whatever follows it — read the section order first and put Geometry where a student would look, right after Flow).
  - Rig key `params` (object, optional, additive — `V` stays 2).

**Steps:**

- [ ] **Step 1: Read** main.js CONTROLS (365–728), buildPanel/syncPanel (730–833), and rig.js in full; spec §3.

- [ ] **Step 2: Implement the panel rows.** Four generic slider rows bound by index:

```js
  { h: "Geometry" },
  ...[0, 1, 2, 3].map((k) => ({
    id: "geom" + k, label: "—",
    min: 0, max: 1, step: 0.01,
    // The row binds to the k-th declared param of whatever scene is up.
    par: () => (SIM.params().decl || [])[k],
    get: function () { const d = this.par(); return d ? SIM.params().values[d.key] : 0; },
    set: function (v) { const d = this.par(); if (d) SIM.setParam(d.key, v); },
    fmt: function (v) {
      const d = this.par();
      return d ? v.toFixed(3) + (d.unit ? " " + d.unit : "") : "";
    },
    info: "A dimension of the scene's own geometry. Moving it redraws the solid and re-rasterises the grid — and resets any averaging window, because the walls the mean was accumulated through are no longer the walls on screen.",
  })),
```

In `syncPanel()`'s slider branch, before the value write add a dynamic-row hook: if `c.par` exists, resolve `d = c.par()`; hide the row and its note when `d` is undefined (`input.parentElement.hidden = !d; note.hidden = !d;` — actually toggle a class consistent with applyPanelFocus's `.off`, so focus logic composes: use `input.parentElement.classList.toggle("gone", !d)` and add `.row.gone,.notes.gone{display:none}` to css/app.css), and when present copy `d.min/d.max/d.step` onto `c` and set the label span: `input.parentElement.querySelector(".lbl").textContent = d.label;`.

- [ ] **Step 3: Rig.** In `snapshot()`, after `dye`: `const pd = SIM.params(); if (pd.decl && pd.decl.length) { o.params = {}; pd.decl.forEach((d) => o.params[d.key] = r4(pd.values[d.key])); }`. In `apply()`, after the `hyd` block: `if (o.params) Object.keys(o.params).forEach((k) => SIM.setParam(k, +o.params[k]));` (before the final `SIM.rasterise()` — setParam rasterises itself, which is redundant but harmless at apply time; note that in a comment). Do NOT touch `V`.

- [ ] **Step 4: Verify.** `node exercises/_runner/smoke.js --only=api,rig` and `node test/ui-smoke.mjs`. Expected: green — no scene declares params yet, so the four rows are hidden everywhere; ui-smoke's layout agreements must hold with the hidden section present.

- [ ] **Step 5: Instant gates**, then **commit**: `Geometry sliders: a scene's params get a panel section and ride the rig (additive, still v2)` + co-author line.

---

### Task 4: SIM.faceForce — sampling the pressure on a face

**Files:**
- Modify: `js/sim.js` (new function near lineFlux ~line 1435; export list)
- Modify: `js/main.js` (APP export block ~line 3233: add `faceForce`)
- Modify: `docs/notation.md` (force row)
- Test: smoke.js still-water closed form (added here), `node exercises/_runner/smoke.js --only=api`

**Interfaces:**
- Consumes: `GEOM.faceSamples`, `GEOM.faceForceFromSamples` (Task 1); `S.solids` (Task 2); sim.js's existing `readState(i0, j0, w, h, U, F, avg)` readback (see boxForce ~line 1494 for the exact call shape and the `cen` return).
- Produces: `SIM.faceForce(solidId, faceId, avg)` →

```js
{ samples: [{x, z, nx, nz, p, f}], Fx, Fz, F, cop: {x,z}|null, wetLen, len,
  solidId, faceId }
```

`p` in the result is physical pressure head-free units consistent with `probe().p` (the solver's P = p/ρ); `Fx/Fz/F` in N per metre width (ρ = 1000 applied inside, matching boxForce). Returns `null` if the solid/face is not found.

**Steps:**

- [ ] **Step 1: Read** sim.js's boxForce + readState + lineFlux (1380–1540) and geom.js's face helpers; spec §4.

- [ ] **Step 2: Implement.**

```js
  /** The pressure force on ONE named face of a scene solid, per metre width.
   *  Same bargain as lineFlux: a readback on a click, never on the frame
   *  path. Samples sit 0.75·dx off the face along the outward normal — in
   *  the water, clear of the solid cell the face bounds — and every term
   *  carries the fill fraction, so air contributes nothing and a
   *  half-wetted face reports half its diagram. Under an averaging window
   *  the sample is the window mean: one window, every instrument. */
  function faceForce(solidId, faceId, avg) {
    const so = (S.solids || []).find((s) => s.id === solidId);
    if (!so) return null;
    const pts = GEOM.faceSamples(so, faceId, S.dx);
    if (!pts || !pts.length) return null;
    // Bounding box of the offset sample points, one readback.
    const off = 0.75 * S.dx;
    ... compute iL,jB,iR,jT from min/max of (x + nx·off, z + nz·off), clamp
        to [0, nx-1]×[0, ny-1], inflate by 1 cell ...
    const w = iR - iL + 1, h = jT - jB + 1;
    ... reuse the S.cvU/S.cvF grow-on-demand buffers exactly as boxForce
        does (lines 1493–1495) ...
    const cen = readState(iL, jB, w, h, S.cvU, S.cvF, avg);
    for (const q of pts) {
      const sx = q.x + q.nx * off, sz = q.z + q.nz * off;
      const i = clamp(Math.floor(sx / S.dx), iL, iR), j = ...;
      const k = ((j - jB) * w + (i - iL)) * 4;
      q.p = S.cvU[k + 2]; q.f = S.cvF[k];
      if (S.mask[j * S.nx + i] > 192) { q.p = 0; q.f = 0; } // sample landed solid
    }
    const ds = pts.length > 1 ? pts[1].s - pts[0].s : S.dx;   // uniform by construction
    const r = GEOM.faceForceFromSamples(pts, ds, 1000, Math.abs(S.p.g) || 9.81);
    return Object.assign(r, { samples: pts, solidId, faceId,
                              len: pts[pts.length - 1].s + ds / 2 });
  }
```

Fill in the elided arithmetic concretely; check whether `readState` under `avg` returns the mean-layout fields the same way boxForce consumes them (it does — copy that convention, including the `cen` flag if it matters for cell-centred pressure; pressure is cell-centred in both layouts so `cen` can be ignored here, say so in a comment). Export `faceForce` from SIM and `faceForce: (sid, fid, avg) => SIM.faceForce(sid, fid, avg)` from APP (follow the APP block's existing style ~line 3233).

- [ ] **Step 3: Add the smoke closed form.** In smoke.js (same section as Task 2's case): boot the `jet` scene (a tank of still-ish water) — better: build a param-free solids test directly — on `sandbox`, draw nothing, pour nothing; instead use `hammer`'s reservoir? Simplest deterministic case: use APP to load scene `sandbox`, then `APP.sim` patch a temporary scene? Too clever. Do this instead: the case creates the still water itself — load `sandbox`, use the existing `APP.placeCV`-style entry points? NO — keep it honest and simple: temporarily register a test scene from the smoke harness if smoke.js already injects any (grep `__settle` and how scenes boot). If injection is not an existing pattern, use scene `jet` (tank holds ~2.15 m of near-still water behind its orifice wall after `spinup`), convert nothing — SKIP the full-physics check here and instead assert the WIRING: `APP.faceForce("nosuch","x")` returns null, and on a scene with no solids every id returns null. The real closed-form force check lands in Task 6 where s3's gate exists (its pool face). Write that intention as a comment in the smoke case.

- [ ] **Step 4: Run** `node exercises/_runner/smoke.js --only=api`. Expected: green.

- [ ] **Step 5: Notation.** Add to `docs/notation.md` (match its table/format): `F` — pressure force per metre width on a named face, N/m, components `Fx, Fz`; centre of pressure — the point on the face through which the resultant acts.

- [ ] **Step 6: Instant gates** (check_notation.py must still pass — if it flags the new symbols, teach it in `exercises/_runner/check_notation.py` following its own comment conventions), then **commit**: `faceForce: the pressure diagram on one named face, integrated the lineFlux way` + co-author line.

---

### Task 5: The Force tool and the overlay drawing

**Files:**
- Modify: `js/main.js` (TOOLS ~line 958, TOOLBAR MEASURE ~line 1534, ICONS ~line 971, onDown ~line 2146, frame-loop sampling near sampleFlux/sampleCV ~2500, overlay draw calls ~2700, KEYS sheet ~1787, `state` init ~line 26/40)
- Modify: `js/overlay.js` (new drawForce + export)
- Test: `node test/ui-smoke.mjs`, manual browser check via the run skill if convenient

**Interfaces:**
- Consumes: `SIM.faceForce` (Task 4), `GEOM.faceAt` (Task 1), `S.solids` via `sim` (Task 2), overlay's `chip`/view idioms.
- Produces:
  - `TOOLS` entry appended LAST: `["force", "Pressure force", "Click a wall or gate face for its pressure diagram — click the same solid again to cycle faces, click open water to clear"]` (no digit — 1–9 are taken; the appended-tool comment at TOOLS' tail explains).
  - Strip: `toolItems(..., "flux")` in the MEASURE family becomes `toolItems("gauge", "rake", "tracer", "measure", "cv", "flux", "force")`.
  - `ICONS.force` — a stroke icon on the 20×20 grid, same weight: a vertical face with three arrows of growing length pressing on it: `'<path d="M13.5 3v14"/><path d="M4 6.5h5M6 10h3M8 13.5h1"/><path d="M9 6.5 7.5 5.4M9 6.5 7.5 7.6M9 10l-1.2-1M9 10l-1.2 1M9 13.5l-.9-.8M9 13.5l-.9.8"/>'` (tune by eye against neighbours).
  - `state.force = null | { solidId, faceId, data, t0 }` — the one selected face and its last sample (like `state.cv`).
  - `OVERLAY.drawForce(ctx, V, sim, force)`.

**Steps:**

- [ ] **Step 1: Read** main.js 940–1010 (TOOLS/ICONS), 1507–1632 (TOOLBAR/toolItems/familyOf), 2084–2160 (onDown), 2497–2560 (sampleFlux/sampleCV — the EMA idiom), 2680–2740 (draw order); overlay.js drawCV (853–1000) and chip (355). Spec §4.

- [ ] **Step 2: Wire the tool.** TOOLS append + TOOLBAR + ICONS as specified. In `onDown`, after the `cv` branch:

```js
  if (state.tool === "force") {
    const hit = GEOM.faceAt(sim.solids || [], x, z, GRAB_PX / view.scale);
    // GRAB_PX is screen px — convert with the view transform the way
    // nearSegment's callers do (read how removeFluxAt gets its tolerance);
    // use the same conversion here.
    if (!hit) { state.force = null; syncPanel(); return; }
    if (state.force && state.force.solidId === hit.solid.id) {
      // Same solid: cycle to its next named face.
      const ids = hit.solid.faces.map((f) => f.id);
      const k = (ids.indexOf(state.force.faceId) + 1) % ids.length;
      state.force = { solidId: hit.solid.id, faceId: ids[k], data: null, t0: sim.t };
    } else {
      state.force = { solidId: hit.solid.id, faceId: hit.faceId, data: null, t0: sim.t };
    }
    return;
  }
```

(`sim.solids` — check how `sim` exposes S: `SIM.get()` returns S and main.js keeps `sim`; grep how main.js reads `sim.segs` / `sim.mask` and follow.) Add a `sampleForce()` beside `sampleCV()` — same shape: paused guard, clock-restart guard, `measuringAvg()`, and the SAME τ = 1 s EMA applied to each sample's `p` and to Fx/Fz (EMA the samples array element-wise only when the face's sample count is unchanged; on a geometry change — rasterise bumps a counter, or just compare lengths — restart clean). Call it where sampleCV is called (grep `sampleCV()` call site). Clear `state.force` in the places `state.cv` is cleared on scene load (grep `state.cv = null`). Add to the KEYS sheet list (~1787) — no key, so only if the sheet lists keyless tools; check and follow (Pour's row is the precedent).

- [ ] **Step 3: Draw it.** In overlay.js, `drawForce(ctx, V, sim, force)` where `force.data` is a faceForce result:

```js
  // The textbook diagram: at each sample an arrow along −n, length ∝ local
  // p/ρg, tips joined and filled translucent; the resultant through the
  // centre of pressure, drawn heavier, with its chip. Scale: the largest
  // head on the face maps to 56 screen px (clamped to a third of the view
  // height), and the chip prints that scale so the picture stays a number.
  // Colour #ff8fa3 (distinct from CV's #ffd166 and the gauge palette).
```

Implementation notes to follow: heads at `q.x − q.nx·L(q)`, `q.z − q.nz·L(q)` mapped through `V.X`/`V.Y` (screen y flips — see drawCV lines 854–855); arrows every ceil(n/24)th sample so a long face is not a hedgehog, the filled outline from every sample; resultant arrow reusing drawCV's head-on-own-axis construction (lines 887–899); chips via `chip()`: `F = 12.4 kN/m` at the CoP, `Fx …  Fz …` below, `scale: 1 m head = 40 px` at the face's start. Draw the SELECTED face itself 2 px in the tool colour so the selection is visible even with zero pressure. Export drawForce; call it in main.js's draw sequence after `drawCV`/`drawFlux` (~line 2706): `if (state.force && state.force.data) OVERLAY.drawForce(ctx, view, sim, state.force);` gated behind `UIMODE.shows` only if other instruments are (they are not — CV draws unconditionally; match CV).

- [ ] **Step 4: ui-smoke.** Read test/ui-smoke.mjs's structure (how it asserts strip families) and add: the MEASURE family contains a `force` tool button; arming it via click leaves the layout agreements intact. Follow the existing case style exactly.

- [ ] **Step 5: Run** `node test/ui-smoke.mjs` (all boots) — expected green. Then `node exercises/_runner/smoke.js --only=api,rig` — expected green (regression only).

- [ ] **Step 6: Instant gates**, **commit**: `A Force tool: click a face, get the pressure diagram and its resultant` + co-author line.

---

### Task 6: s3 (and c13) gates become parametric solids

**Files:**
- Modify: `js/scenes.js` (channel() ~lines 110–184; the s3 entry ~463; c13 ~488)
- Test: smoke closed form added here; `node exercises/_runner/smoke.js` full run at the end of the task

**Interfaces:**
- Consumes: `GEOM.slab`, `GEOM.poly` (Task 1); `solids(W,H,P,params)` + `params` contracts (Task 2); panel rows (Task 3); `faceForce` (Task 4).
- Produces: `channel()` emits, for scenes with `o.gate`, a `solids()` gate and a `params` declaration `[{key: "gate_a", label: "Gate opening", min: 0.05, max: <1.2·inletDepth>, step: 0.005, value: o.gate.a, unit: "m"}]`; the bed slabs STAY in `walls()` (the shim) — only the gate moves, this task is the parametric proof, not a wholesale migration.

**Steps:**

- [ ] **Step 1: Read** scenes.js channel() in full (110–184) and the s3/c13 entries with their comments; spec §5.

- [ ] **Step 2: Implement.** In channel(): remove the gate from the `walls()` array; add

```js
    const params = o.gate
      ? [{ key: "gate_a", label: "Gate opening", min: 0.05,
           max: Math.min(o.inletDepth, H - bedTop(o.gate.x)) ,
           step: 0.005, value: o.gate.a, unit: "m" }]
      : undefined;
    const solids = o.gate ? (W_, H_, P_, par) => {
      const a = (par && par.gate_a !== undefined) ? par.gate_a : o.gate.a;
      const b = bedTop(o.gate.x);
      // The gate blade: 0.05 m thick, lip at bed + a, top out of the domain.
      // Faces: upstream (the pressure-diagram face), downstream, lip.
      const x = o.gate.x, t = 0.025;
      return [GEOM.poly(
        [[x - t, b + a], [x + t, b + a], [x + t, H_ + 0.5], [x - t, H_ + 0.5]],
        [{ id: "us", label: "Upstream face", e0: 3, e1: 3 },
         { id: "ds", label: "Downstream face", e0: 1, e1: 1 },
         { id: "lip", label: "Lip", e0: 0, e1: 0 }], "gate")];
    } : undefined;
```

CHECK the winding: `[[x−t, b+a], [x+t, b+a], [x+t, top], [x−t, top]]` is CCW (lip → right side up → top → left side down); edge 3 is `[x−t,top]→[x−t,b+a]`, the LEFT (upstream) side, outward normal −x ✓; edge 1 is the right side, +x ✓; edge 0 the lip, normal −z ✓. Wire `solids` and `params` into the returned Object.assign. The old fixed-gate rasterisation and the new one at `value: o.gate.a` must agree — same butt-ended footprint at the same lip height (old: `[x, b + a, x, H, 0.05]` stamped as a 0.05-thick capsule; new: an exact 0.05-wide rectangle; the capsule's radius floor `max(0.05, dx·1.7)·0.5` also floors the polygon via the edge stroke, so at Medium they coincide).

- [ ] **Step 3: The physics must not have moved.** Run the full `node exercises/_runner/smoke.js` (~9 min): every scene boots, s3 and c13 keep their per-scene physics gates. Any drift in s3/c13 is a geometry regression in Step 2 — fix the polygon, not the scene numbers.

- [ ] **Step 4: The closed form that Task 4 deferred.** Add the smoke case: boot `s3` (`?scene=s3`), `await` settle (use the harness's existing settle helper at s3's spinup 26), then `APP.faceForce("gate", "us")`. Behind the gate stands a pool of depth `d ≈ inletDepth = 1.40` above `bedTop(1.2)`; the upstream face is wetted from the lip (bed + a) up to the pool surface. Expected from hydrostatics with the pool at `z_s = bedTop(1.2) + 1.40`: `Fx ≈ −½ρg(z_s − lip)² + (dynamic correction near the lip)` — the flow under the gate depresses the near-lip pressure, so assert BRACKETS, not equality: `|Fx|` within **±20%** of `½·1000·9.81·(1.40 − 0.35)²  ≈ 5.4 kN/m`, and `Fx > 0` (the upstream face's outward normal is −x; the force on the surface is −∮p n ds, so the pool pushes the gate along +x, downstream), `cop.z` between the lip and mid-depth. Print the measured numbers into the assertion message (the repo's measured-numbers habit) and tighten the tolerance to what the measurement supports.

- [ ] **Step 5: Slider proof.** Same smoke case: `SIM.setParam`-equivalent through the page (`APP.sim`… — expose nothing new; drive `window.SIM ? … ` — grep how smoke drives page globals; CDP evaluates in page context where `SIM` is a page global, so `SIM.setParam("gate_a", 0.50)` works directly), assert `APP.volume()` finite after `SIM.columns(true)` (the cached-columns sharp edge — see AGENTS.md), the mask changed (rasterise ran), and averaging was reset if it was on.

- [ ] **Step 6: Run** the new smoke subset plus `--only=api,rig`; **instant gates**; **commit**: `s3's gate is a solid with a face and a slider — and the diagram on it reads ½ρg d²` + co-author line.

---

### Task 7: The hump scene

**Files:**
- Modify: `js/scenes.js` (new entry after `sa1`, ~line 424)
- Test: full `node exercises/_runner/smoke.js` (the new scene enters "every scene" automatically)

**Interfaces:**
- Consumes: `GEOM.poly`, `GEOM.humpPts` (Task 1); `solids`/`params` (Task 2).
- Produces: scene id `hump`, group "Open channel — surface profiles".

**Steps:**

- [ ] **Step 1: Read** the m1/m2 channel entries and their measured-number comments (326–424); the channel() builder; spec §5.

- [ ] **Step 2: Implement.** A dedicated entry (NOT through channel() — the hump is the scene's whole subject and channel() has no hump concept):

```js
    { id: "hump", name: "Hump in a mild channel", key: "Specific energy",
      group: "Open channel — surface profiles", chan: 1,
      W: 16, H: 1.05, c: 22, cf: 0.125, cs: 0.16, mode: 3,
      hmax: 0.55, vmax: 2.0, spinup: 30, dyeLine: 0.9,
      open: [1, 1, 0, 0],
      inflow: { level: <bed0 + d + velocity head — compute as inletLevel does>, q: 0.25, on: 1, free: 0 },
      tailwater: { level: 0.35 + 0.30, on: 1 },     // mild control downstream
      params: [{ key: "hump_h", label: "Hump height", min: 0, max: 0.45,
                 step: 0.005, value: 0.15, unit: "m" }],
      solids: (W, H, P, par) => {
        const h = par && par.hump_h !== undefined ? par.hump_h : 0.15;
        const zb = 0.35, x0 = 6.0, x1 = 10.0;
        const crest = GEOM.humpPts(x0, x1, Math.max(h, 0.005), zb, 160);
        // Close the solid down into the bed (below z = 0: ground is solid
        // all the way down), left-to-right along the crest then back under.
        const verts = [[x0, -0.5]].concat(crest).concat([[x1, -0.5]]);
        ... CCW check: that path runs bottom-left → up over the crest →
            bottom-right, which is CLOCKWISE for a z-up frame — reverse it,
            and set the face over the reversed crest run ...
        return [GEOM.poly(verts, [{ id: "crest", label: "Hump crest",
                                     e0: <first crest edge>, e1: <last> }], "hump")];
      },
      walls: () => [[-1.0, 0.35 - 0.7, 17, 0.35 - 0.7, 1.4]],   // the flat bed, shim
      water: (x, z, P) => (z <= 0.35 ? 0 : SCENES.still(0.35 + 0.30, z, P)),
      blurb: "A mild channel with a smooth hump you can raise. The surface dips over the crest while E is to spare — and when the crest eats the margin, the flow chokes: upstream depth rises and the crest runs critical.",
      tips: [ ...4–5 in the house style: E = d + q²/2gd² is conserved over the
              hump until it cannot be; choking when h > E₁ − E_c; watch the
              Froude colours at the crest; the Force tool on the crest face... ] },
```

Resolve every `...` concretely at implementation time (winding, face run indices, the exact inflow level via the same arithmetic `inletLevel` uses — q²/(2g d²) with d = 0.65's... compute d from the tailwater-controlled depth 0.30+? Use d = 0.30 over the bed at the inlet? NO — pick `inletDepth`-equivalent 0.34 (subcritical, above d_c = 0.19) and level = 0.35 + 0.34 + 0.25²/(2·9.81·0.34²) ≈ 0.718). The water() fill starts level with the tailwater. Keys/labels follow check_notation.py's rules (run it).

- [ ] **Step 3: Watch it run.** Serve and open `?scene=hump` with the browser tools available (or the run skill): the hump must stand in the flow, the surface must dip over it at h = 0.15, and raising the slider to 0.45 must visibly choke the approach. Screenshot for the record. Fix geometry/level until this is true — this step is the scene actually working, not a formality.

- [ ] **Step 4: Measure spinup.** Headless: boot, `APP.tick` through ~120 s of sim time sampling the mid-reach depth every 5 s (via `APP.probe`); spinup = the last time the 10 s trend moves > 3% (the sa1 method, AGENTS.md). Write the measured number into the scene with a comment saying it was measured and how.

- [ ] **Step 5: ui-smoke — the Geometry section.** Add the case the spec asks for, now that a params scene exists: booting `?scene=hump` shows the Geometry panel section with exactly one visible slider row; booting `?scene=m1` (no params) hides the section's rows. Follow ui-smoke.mjs's existing boot-and-assert style.

- [ ] **Step 6: Full gates.** `node exercises/_runner/smoke.js` (the new scene joins every-scene checks), `node test/ui-smoke.mjs`, instant gates.

- [ ] **Step 7: Commit**: `A hump you can raise: specific energy made a slider, its crest one curved face` + co-author line.

---

### Task 8: Documentation and the final sweep

**Files:**
- Modify: `docs/engineering-notes.md` (extend Task 1's section), `docs/boundary-conditions.md` (only if solids interact with edge ownership — read; likely no change), `AGENTS.md` (geom.js row in the file table, geom-test row in the testing table)
- Test: everything

**Steps:**

- [ ] **Step 1: AGENTS.md.** Add `js/geom.js` to the "Where things live" table (`GEOM — polygon solids with named faces: builders, samplers, point-in-polygon, face force integration; no WebGL`) and `node test/geom-test.mjs` to the testing table (guards: GEOM's closed forms — winding, slab corners, arc lengths, ½ρgH²; cost: instant; note it now runs in checks.yml with the other instant gates).

- [ ] **Step 2: engineering-notes.** Extend the polygon section with what the branch measured: the s3 face-force number and its tolerance, the shim equivalence result, the params-stays-v2 reasoning (pointing at rig.js's own comment), and the thin-polygon edge-stroke guard.

- [ ] **Step 3: The whole battery, in order:** the four instant gates + `node test/geom-test.mjs`; `node exercises/_runner/smoke.js` (full, ~9 min); `node exercises/_runner/smoke.js --only=avg` (~4 min — rasterise's avgReset was touched by setParam paths); `node test/ui-smoke.mjs`. ALL green before the final commit; paste the tails of each run into the commit message body or the PR description.

- [ ] **Step 4: Commit**: `Polygon geometry: the paper trail — AGENTS, notes, and every gate green` + co-author line.

---

## Verification checklist (for the finishing review)

- [ ] All 20 pre-existing scenes boot and pass smoke.js unchanged (the shim's promise).
- [ ] `?scene=s3`: Geometry section shows one slider; moving it moves the gate; Average resets.
- [ ] Force tool on s3's gate: diagram + resultant + CoP; number within the Task 6 bracket.
- [ ] `?scene=hump`: slider 0 → 0.45 chokes the flow; crest is one selectable curved face.
- [ ] A rig saved on s3 with the slider moved reloads with the gate where it was; a rig without `params` still loads (v2 additive).
- [ ] `git log` — every commit passes the instant gates (no fix-up commits needed to get green).
