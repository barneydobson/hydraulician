/**
 * stream.js — dependency record (checked by exercises/_runner/check_headers.py).
 *
 * Defines: STREAM
 *
 * Reads:   none
 */
/* =========================================================================
 * stream.js — STREAMLINES as contours of the stream function. No WebGL here:
 * SIM.streamRequest/streamPoll fetch the field, this turns it into line
 * segments, OVERLAY.drawStreamlines paints them.
 *
 * WHY CONTOURS OF ψ AND NOT INTEGRATED SEED LINES. In 2D incompressible flow
 * the volume flux per unit width between two points is the difference of ψ
 * between them, so contours at equal Δψ are streamlines that bound streamtubes
 * of equal discharge — their spacing is ∝ 1/speed, which is the picture the
 * lecture draws and the one seeded integration cannot give (RK lines from
 * evenly spaced seeds bunch and thin by accident of where they started, end
 * at stagnation points, never close round an eddy, and need a stopping rule
 * at every wall and surface). With ψ the hard cases come free:
 *   - a wall carries no flux, so ψ is constant along it and every solid is a
 *     streamline — bed, pipe soffit, bluff body — with no special-casing;
 *   - the free surface is a streamline in steady flow, because the flux is
 *     weighted by the fill f and the void above carries none;
 *   - a recirculation is a closed contour, with the dividing streamline the
 *     level that equals the wall's ψ;
 *   - a pressurised pipe is just a column with no void in it.
 *
 * HOW ψ IS BUILT. Nodes sit at cell corners (x = i·dx, z = j·dx), so each
 * marching-squares cell IS a grid cell and "draw only in wet cells" is one
 * test. Along the bottom node row ψ steps by −q_z·dx (the flux through the
 * domain floor: zero on a closed floor, the falling jet on an open one); then
 * each node column is integrated upward by +q_x·dx through the x-faces it
 * runs along. q = (f u, f w) with f capped at 1 (pressurised water is still
 * one volume of water); under Average it is the Favre accumulator's own
 * <f u_c>, which IS the mean volume flux. Faces touching a solid carry
 * nothing, so integrating up through a wall adds zero.
 *
 * Integrating along columns only is exact for a divergence-free field. Where
 * the discrete field is not (the weakly-compressible solver's small dilatation,
 * a free surface rising or falling within the instant), the error shows up
 * only as a column-to-column mismatch in ψ ABOVE that cell — mostly in the
 * void, which is never drawn. Starting from the floor is the right anchor:
 * every scene's bed (or plan-view wall) is solid all the way down.
 * ========================================================================= */
"use strict";

const STREAM = (() => {
  /** ψ on the nx × (ny + 1) corner nodes, and the wet-cell flags, from a
   *  SIM.streamPoll() result: the fluxes arrive packed two cells per texel
   *  (FS_SFLUX in shaders.js), already zeroed on every face touching a solid
   *  and already the Favre mean flux under Average. */
  function psi(R, out) {
    const nx = R.nx, ny = R.ny, dx = R.dx, D = R.D, w2 = R.w2;
    const n = nx * (ny + 1);
    const P = out && out.psi && out.psi.length === n ? out.psi : new Float64Array(n);
    const wet = out && out.wet && out.wet.length === nx * ny ? out.wet : new Uint8Array(nx * ny);
    // The floor: ψ steps by −q_z dx across each cell's bottom face.
    P[0] = 0;
    for (let i = 1; i < nx; i++) {
      const k = ((i - 1) >> 1) * 4 + 2 + ((i - 1) & 1);
      P[i] = P[i - 1] - D[k] * dx;
    }
    for (let i = 0; i < nx; i++) wet[i] = 0;            // the bottom ring row
    for (let j = 0; j < ny; j++) {
      const row = j * w2 * 4, base = j * nx, up = (j + 1) * nx;
      for (let i = 0; i < nx; i++) {
        const t = row + (i >> 1) * 4, h = i & 1;
        P[up + i] = P[base + i] + D[t + h] * dx;
        if (j > 0) wet[base + i] = (D[t + 2] >> h) & 1;
      }
    }
    return { psi: P, wet, nx, ny, dx, avg: R.avg, t: R.t };
  }

  /** The range of ψ over the corners of wet cells. */
  function range(G) {
    const { psi: P, wet, nx, ny } = G;
    let lo = Infinity, hi = -Infinity;
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx - 1; i++) {
      if (!wet[j * nx + i]) continue;
      const a = P[j * nx + i], b = P[j * nx + i + 1];
      const c = P[(j + 1) * nx + i], d = P[(j + 1) * nx + i + 1];
      lo = Math.min(lo, a, b, c, d); hi = Math.max(hi, a, b, c, d);
    }
    return hi > lo ? [lo, hi] : null;
  }

  /** A round Δψ (1, 2, 2.5 or 5 × 10^k) within a factor 0.7–1.43 of `raw`,
   *  so the key can quote it and the line count stays near what was asked. */
  function nice(raw) {
    const e = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / e;
    return (m < 1.4 ? 1 : m < 2.2 ? 2 : m < 3.5 ? 2.5 : m < 7 ? 5 : 10) * e;
  }

  /** Marching squares over wet cells at the levels ψ = (k + ½)Δψ — the
   *  half-step keeps every level off the walls' own ψ (a wall is already
   *  drawn; a contour lying along it would be a degenerate double line), and
   *  lines at tube centres still bound tubes of equal discharge Δψ. Returns
   *  segment endpoints in metres, x0 z0 x1 z1 per segment — a view on a
   *  scratch buffer that the NEXT call overwrites (the caller keeps only the
   *  latest set, and growing a JS array by push cost more than the march). */
  let scratch = new Float32Array(1 << 16);
  function contours(G, dpsi) {
    const { psi: P, wet, nx, ny, dx } = G;
    const pts = new Float64Array(8);
    let seg = scratch, ns = 0;
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx - 1; i++) {
      if (!wet[j * nx + i]) continue;
      // corners counter-clockwise from bottom-left
      const a = P[j * nx + i], b = P[j * nx + i + 1];
      const c = P[(j + 1) * nx + i + 1], d = P[(j + 1) * nx + i];
      const lo = Math.min(a, b, c, d), hi = Math.max(a, b, c, d);
      const k0 = Math.ceil(lo / dpsi - 0.5), k1 = Math.floor(hi / dpsi - 0.5);
      if (k1 < k0) continue;
      const x = i * dx, z = j * dx;
      for (let k = k0; k <= k1; k++) {
        const L = (k + 0.5) * dpsi;
        // Edge crossings, in corner order: bottom (a→b), right (b→c),
        // top (d→c), left (a→d). Strictly-above test, so a corner exactly
        // on the level counts as below on both of its edges.
        const A = a > L, Bb = b > L, Cc = c > L, Dd = d > L;
        let m = 0;
        if (A !== Bb) { const t = (L - a) / (b - a); pts[m++] = x + t * dx; pts[m++] = z; }
        if (Bb !== Cc) { const t = (L - b) / (c - b); pts[m++] = x + dx; pts[m++] = z + t * dx; }
        if (Dd !== Cc) { const t = (L - d) / (c - d); pts[m++] = x + t * dx; pts[m++] = z + dx; }
        if (A !== Dd) { const t = (L - a) / (d - a); pts[m++] = x; pts[m++] = z + t * dx; }
        if (m < 4) continue;
        if (ns + 8 > seg.length) {
          const g = new Float32Array(seg.length * 2); g.set(seg); seg = scratch = g;
        }
        if (m === 4) { seg[ns++] = pts[0]; seg[ns++] = pts[1]; seg[ns++] = pts[2]; seg[ns++] = pts[3]; }
        else {
          // Saddle (a, c on one side, b, d on the other): pair by the centre
          // value. Centre with a → b and d are the cut-off corners, so the
          // lines are bottom–right and top–left; otherwise a and c are cut
          // off: bottom–left and right–top.
          const o = (0.25 * (a + b + c + d) > L) === A
            ? [0, 1, 2, 3, 4, 5, 6, 7] : [0, 1, 6, 7, 2, 3, 4, 5];
          for (let q = 0; q < 8; q++) seg[ns++] = pts[o[q]];
        }
      }
    }
    return seg.subarray(0, ns);
  }

  return { psi, range, nice, contours };
})();
