"use strict";
/**
 * geom.js — GEOM: 2D polygon geometry in the vertical (x, z) plane, kept
 * free of WebGL and DOM so it can be unit-tested against closed-form
 * answers — the RECON pattern (js/reconstruct.js). This is the foundation
 * a later polygon rasteriser (js/sim.js) and pressure-force instrument are
 * built on; nothing here draws anything or touches a GPU buffer.
 *
 * A "solid" is a simple polygon `{id, verts, faces}`: verts are `[x,z]`
 * pairs wound CCW, edge `i` runs `verts[i] -> verts[(i+1) % n]`. The
 * winding is not cosmetic — it fixes what "outward" means. For a CCW
 * polygon the outward normal of edge `i` is its tangent turned a
 * quarter-turn CLOCKWISE (`edgeNormal` below); get the winding backwards
 * and every normal points into the water instead of out of it, silently.
 *
 * A face names a stretch of boundary a caller cares about (the crest of a
 * weir, the wetted side of a wall) as a run of CONSECUTIVE edges
 * `{id, label, e0, e1}` rather than a free-standing list of indices — that
 * is the only shape a boundary run through a polygon can take, and it lets
 * a wrap (`e0 > e1`, past the last vertex back to 0) be written with two
 * numbers instead of an index array. `faceSamples`/`faceForceFromSamples`
 * are what a pressure-force instrument (a later task) integrates over.
 *
 * Curves (`arcPts`, `humpPts`) are polyline-sampled rather than kept as
 * true arcs, at a spacing fine enough that the chord's sagitta sits far
 * below the finest cell the app runs at (Δx ~ 2.6 mm at Ultra) — everything
 * downstream (rasteriser, `contains`, `faceSamples`) only ever has to know
 * about straight edges.
 */
const GEOM = (() => {

  /** The base constructor every builder below goes through: wrap verts and
   *  faces into one solid, filling a face's label from its id when the
   *  caller did not give one. */
  function poly(verts, faces, id) {
    return {
      id,
      verts: verts.map(v => [v[0], v[1]]),
      faces: faces.map(f => ({
        id: f.id, label: f.label === undefined ? f.id : f.label, e0: f.e0, e1: f.e1,
      })),
    };
  }

  /** The butt-ended thick segment used for walls: a rectangle whose long
   *  sides run alongside the centreline `(x0,z0)->(x1,z1)` at `+-th/2`,
   *  cut square at both ends — no round caps, per AGENTS.md's geometry
   *  contract (a round cap quietly eats half a thickness off every gap).
   *  `m` is the unit LEFT-normal of the centreline tangent, so `side1`
   *  (the `+m` side) is the top of a horizontal slab and `side0` is the
   *  underside; a caller drawing a vertical or sloped wall wants
   *  `opts.faces` instead of the default naming. */
  function slab(x0, z0, x1, z1, th, opts) {
    opts = opts || {};
    const dx = x1 - x0, dz = z1 - z0;
    const len = Math.hypot(dx, dz) || 1e-12;
    const tx = dx / len, tz = dz / len;
    const mx = -tz, mz = tx, half = th / 2;
    const A = [x0 + mx * half, z0 + mz * half];
    const B = [x0 - mx * half, z0 - mz * half];
    const C = [x1 - mx * half, z1 - mz * half];
    const D = [x1 + mx * half, z1 + mz * half];
    const faces = opts.faces || [
      { id: "side1", e0: 2, e1: 2 },   // D -> A: the +m (top) long side
      { id: "side0", e0: 0, e1: 0 },   // B -> C: the -m (bottom) long side
    ];
    return poly([B, C, D, A], faces, opts.id);
  }

  /** An axis-aligned box, CCW from its bottom-left corner. */
  function rect(x0, z0, x1, z1, opts) {
    opts = opts || {};
    const faces = opts.faces || [
      { id: "bottom", e0: 0, e1: 0 },
      { id: "right", e0: 1, e1: 1 },
      { id: "top", e0: 2, e1: 2 },
      { id: "left", e0: 3, e1: 3 },
    ];
    return poly([[x0, z0], [x1, z0], [x1, z1], [x0, z1]], faces, opts.id);
  }

  /** Points along a circular arc from angle `a0` to `a1` (radians, CCW
   *  positive), `n+1` of them. Default `n` keeps the chord's sagitta
   *  (~ r*dtheta^2/8) far below the finest cell by bounding each segment's
   *  own arc length to 0.02 m — conservative rather than tight. */
  function arcPts(cx, cz, r, a0, a1, n) {
    if (n === undefined) n = Math.max(8, Math.ceil(Math.abs(a1 - a0) * r / 0.02));
    const pts = [];
    for (let k = 0; k <= n; k++) {
      const a = a0 + (a1 - a0) * k / n;
      pts.push([cx + r * Math.cos(a), cz + r * Math.sin(a)]);
    }
    return pts;
  }

  /** A cosine-squared bump: zero value AND zero slope at both ends, so it
   *  splices into a flat bed with no kink — the standard smooth hump. */
  function humpPts(x0, x1, h, zb, n) {
    if (n === undefined) n = Math.max(16, Math.ceil(Math.abs(x1 - x0) / 0.02));
    const pts = [];
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      const s = Math.sin(Math.PI * t);
      pts.push([x0 + (x1 - x0) * t, zb + h * s * s]);
    }
    return pts;
  }

  /** Outward unit normal of edge `i`, for a CCW-wound solid: the tangent
   *  turned a quarter-turn clockwise. Get the winding backwards and this
   *  points into the solid instead of away from it — nothing here can
   *  catch that for you, which is exactly what G2 in test/geom-test.mjs
   *  pins down. */
  function edgeNormal(solid, i) {
    const n = solid.verts.length;
    const v0 = solid.verts[i], v1 = solid.verts[(i + 1) % n];
    const dx = v1[0] - v0[0], dz = v1[1] - v0[1];
    const len = Math.hypot(dx, dz) || 1e-12;
    const tx = dx / len, tz = dz / len;
    return [tz, -tx];
  }

  /** Even-odd point-in-polygon, ray cast toward +x — the classic test. */
  function contains(solid, x, z) {
    const verts = solid.verts;
    let inside = false;
    for (let i = 0, j = verts.length - 1; i < verts.length; j = i++) {
      const xi = verts[i][0], zi = verts[i][1], xj = verts[j][0], zj = verts[j][1];
      if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside;
    }
    return inside;
  }

  /** The edge indices a face resolves to, wrap included. */
  function faceEdges(solid, faceId) {
    const face = solid.faces.find(f => f.id === faceId);
    if (!face) return [];
    const n = solid.verts.length;
    const out = [];
    if (face.e0 <= face.e1) {
      for (let i = face.e0; i <= face.e1; i++) out.push(i);
    } else {
      for (let i = face.e0; i < n; i++) out.push(i);
      for (let i = 0; i <= face.e1; i++) out.push(i);
    }
    return out;
  }

  /** Sample points along a face's polyline at spacing <= ds (at least 2 per
   *  edge, so a single-edge face is never reduced to its own endpoints),
   *  with the arc-length coordinate `s` and the outward normal carried
   *  along for `faceForceFromSamples` to integrate. */
  function faceSamples(solid, faceId, ds) {
    const out = [];
    let sBase = 0;
    for (const e of faceEdges(solid, faceId)) {
      const v0 = solid.verts[e], v1 = solid.verts[(e + 1) % solid.verts.length];
      const dx = v1[0] - v0[0], dz = v1[1] - v0[1];
      const L = Math.hypot(dx, dz);
      const [nx, nz] = edgeNormal(solid, e);
      const nk = Math.max(2, Math.ceil(L / ds));
      for (let k = 0; k < nk; k++) {
        const t = (k + 0.5) / nk;
        out.push({ x: v0[0] + t * dx, z: v0[1] + t * dz, nx, nz, s: sBase + t * L });
      }
      sBase += L;
    }
    return out;
  }

  /** Point-to-segment distance, for `faceAt`'s hit-testing. */
  function pointSegDist(px, pz, x0, z0, x1, z1) {
    const dx = x1 - x0, dz = z1 - z0, len2 = dx * dx + dz * dz;
    let t = len2 > 0 ? ((px - x0) * dx + (pz - z0) * dz) / len2 : 0;
    t = t < 0 ? 0 : (t > 1 ? 1 : t);
    return Math.hypot(px - (x0 + t * dx), pz - (z0 + t * dz));
  }

  /** The nearest named face across a set of solids, within `tol` — what a
   *  pointer tool hovers to pick a wall to place a pressure-force
   *  instrument on. Distance is point-to-segment over every edge the face
   *  resolves to, so a multi-edge face is hit along its whole run. */
  function faceAt(solids, x, z, tol) {
    let best = null;
    for (const solid of solids) {
      for (const face of solid.faces) {
        for (const e of faceEdges(solid, face.id)) {
          const v0 = solid.verts[e], v1 = solid.verts[(e + 1) % solid.verts.length];
          const dist = pointSegDist(x, z, v0[0], v0[1], v1[0], v1[1]);
          if (dist <= tol && (!best || dist < best.dist)) best = { solid, faceId: face.id, dist };
        }
      }
    }
    return best;
  }

  /** The pressure force ON a face, per metre width, from samples already
   *  carrying `p` (m^2/s^2, the solver's own pressure units — already /rho)
   *  and `f` (fill). Minus sign because pressure pushes along `-n`. `g` is
   *  accepted for interface symmetry with the rest of the pressure-force
   *  instrument; it plays no part in this formula because `p` already has
   *  gravity baked in wherever the caller built it hydrostatically.
   *
   *  Centre of pressure: solving `Sum(r_i x dF_i) = r_cop x F` for a point
   *  ON the polyline — rather than the line-of-action intersection, which
   *  can land off the face on a non-convex boundary — by scanning for the
   *  sample nearest the line of action `x*Fz - z*Fx = M`. Exact enough at
   *  the sampling spacing, and always somewhere to draw the arrow. */
  function faceForceFromSamples(samples, ds, rho, g) {
    let Fx = 0, Fz = 0, wetLen = 0, M = 0;
    for (const s of samples) {
      const fc = Math.min(s.f, 1);
      const dFx = -fc * rho * s.p * s.nx * ds;
      const dFz = -fc * rho * s.p * s.nz * ds;
      Fx += dFx; Fz += dFz;
      M += s.x * dFz - s.z * dFx;
      if (fc * s.p > 0) wetLen += ds;
    }
    const F = Math.hypot(Fx, Fz);
    let cop = null;
    if (F >= 1e-9) {
      let best = -1, bestVal = Infinity;
      for (let i = 0; i < samples.length; i++) {
        const s = samples[i];
        const val = Math.abs(s.x * Fz - s.z * Fx - M);
        if (val < bestVal) { bestVal = val; best = i; }
      }
      cop = { x: samples[best].x, z: samples[best].z };
    }
    return { Fx, Fz, F, cop, wetLen };
  }

  return {
    poly, slab, rect, arcPts, humpPts, edgeNormal, contains,
    faceEdges, faceSamples, faceAt, faceForceFromSamples,
  };
})();
