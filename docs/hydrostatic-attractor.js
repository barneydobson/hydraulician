// Does the solver's P actually BECOME hydrostatic pressure?
// Run with:  node docs/hydrostatic-attractor.js
//
// Nothing in the formulation imposes dP/dz = -g. The claim in numerics.md §3 is
// that hydrostatic balance is the *equilibrium* of the compressible dynamics and
// that the solver reaches it: the fluid compresses under its own weight until
// grad P supports the load, and the free-surface condition P = 0 above f = 1
// supplies the constant of integration.
//
// Every scene is initialised by scenes.js `still()` with the equilibrium profile
// f = 1 + g(lev-z)/c^2 already in place, so the scenes never test this. Here the
// column starts UNIFORM and uncompressed -- f = 1 throughout, hence P = 0
// everywhere, which is maximally wrong -- and the question is whether it
// converges to P = g(eta - z).
//
// Mass is conserved, so the column must also settle LOWER than it started: the
// slot storage has to be filled from the water already present. With
// M = integral f dz held fixed, the equilibrium surface solves
//     M = eta + g*eta^2 / (2c^2)
//
// float64 here: this is a question about the physics of the closure, so float32
// rounding is deliberately kept out of it.

const G = 9.81;

const smoothstep = (e0, e1, x) => {
  const t = Math.min(Math.max((x - e0) / (e1 - e0), 0), 1);
  return t * t * (3 - 2 * t);
};
const vanLeer = (r) => (r + Math.abs(r)) / (1 + Math.abs(r));
function faceVal(fmm, fm, fp, fpp, a) {
  const d = fp - fm;
  if (Math.abs(d) < 1e-12) return fm;
  if (a >= 0) return fm + 0.5 * vanLeer((fm - fmm) / d) * d;
  return fp + 0.5 * vanLeer((fp - fpp) / -d) * -d;
}
/** equilibrium surface for a conserved f-integral M */
const etaEq = (M, c) => {
  const a = G / (2 * c * c);
  return (-1 + Math.sqrt(1 + 4 * a * M)) / (2 * a);
};

function run({ c, dx, d0, T, nu = 1e-5, cs = 0.16, bulk = 0.10, samples = 10 }) {
  const ny = Math.ceil(d0 / dx) + 30;
  const dt = 0.45 * dx / (c + 6);
  const c2 = c * c;
  const z = new Float64Array(ny), f = new Float64Array(ny),
        v = new Float64Array(ny), P = new Float64Array(ny);

  // UNIFORM start: no compression anywhere, so P = 0 and the column is in
  // free fall except where the floor stops it.
  for (let j = 0; j < ny; j++) { z[j] = (j + 0.5) * dx; f[j] = z[j] < d0 ? 1 : 0; }
  const M = f.reduce((a, b) => a + b, 0) * dx;
  const etaTarget = etaEq(M, c);

  const steps = Math.round(T / dt);
  const capBase = 0.20 * dx / dt;
  const trace = [];

  const measure = (t) => {
    // (a) the hydrostatic equation itself: |dP/dz + g| / g, no eta needed
    // (b) the absolute profile against g(eta - z), eta from mass conservation
    // both over the submerged interior, excluding the smeared interface cells
    let slopeErr = 0, absErr = 0, n = 0, vmax = 0;
    for (let j = 1; j < ny - 1; j++) {
      if (f[j] <= 1.0000001 || f[j + 1] <= 1.0000001) continue;
      slopeErr = Math.max(slopeErr, Math.abs((P[j + 1] - P[j]) / dx + G) / G);
      absErr = Math.max(absErr, Math.abs(P[j] - G * (etaTarget - z[j])));
      vmax = Math.max(vmax, Math.abs(v[j]));
      n++;
    }
    let mass = 0; for (let j = 0; j < ny; j++) mass += f[j] * dx;
    trace.push([t, n ? slopeErr : 1, n ? absErr / (G * etaTarget) : 1, vmax, mass / M - 1]);
  };

  for (let n = 0; n <= steps; n++) {
    for (let j = 0; j < ny; j++) {
      const dv = j + 1 < ny ? (v[j + 1] - v[j]) / dx : 0;
      let p = c2 * Math.max(f[j] - 1, 0);
      p -= bulk * c * dx * dv * smoothstep(0.90, 1.0, f[j]);
      P[j] = Math.max(p, 0);
    }
    if (n % Math.max(1, Math.floor(steps / samples)) === 0) measure(n * dt);
    if (n === steps) break;

    const vNew = new Float64Array(ny);
    for (let j = 1; j < ny; j++) {
      const fFv = Math.max(f[j], f[j - 1]);
      const gate = smoothstep(0.0, 0.05, fFv);
      let vn = v[j];
      const dvdy = j + 1 < ny ? (v[j + 1] - v[j]) / dx : 0;
      const nuT = nu + (cs * dx) * (cs * dx) * Math.sqrt(2 * dvdy * dvdy);
      const vN = j + 1 < ny ? v[j + 1] : v[j];
      vn += dt * nuT * (vN + v[j - 1] - 2 * v[j]) / (dx * dx);
      vn += dt * -G * gate;                       // gravity
      vn -= dt * (P[j] - P[j - 1]) / dx;          // -grad P
      const dryV = 1 - smoothstep(0.0, 0.02, fFv);
      vn *= 1 - Math.min(dt * 1.5 * dryV, 1);
      const capV = capBase + (80 - capBase) * smoothstep(0.05, 0.50, fFv);
      vNew[j] = Math.min(Math.max(vn, -capV), capV);
    }
    vNew[0] = 0;
    v.set(vNew);

    const lim4 = 0.25 * dx / dt;
    const flux = new Float64Array(ny + 1);
    for (let j = 1; j < ny; j++) {
      const F = v[j] * faceVal(f[Math.max(j - 2, 0)], f[j - 1], f[j],
                               f[Math.min(j + 1, ny - 1)], v[j]);
      flux[j] = Math.min(Math.max(F, -lim4 * f[j]), lim4 * f[j - 1]);
    }
    for (let j = 0; j < ny; j++) {
      f[j] = Math.min(f[j] - dt * (flux[j + 1] - flux[j]) / dx, 8);
      if (!(f[j] > 0)) f[j] = 0;
    }
  }

  // final profile check at a few depths
  const probes = [];
  for (const frac of [0.1, 0.3, 0.5, 0.7, 0.9]) {
    const zz = etaTarget * (1 - frac);
    const j = Math.min(ny - 1, Math.max(0, Math.round(zz / dx - 0.5)));
    probes.push([z[j], P[j], G * (etaTarget - z[j])]);
  }
  return { dt, steps, d0, M, etaTarget, trace, probes };
}

const c = 25, d0 = 4.5;
const r = run({ c, dx: 0.02, d0, T: 200, samples: 20 });
console.log(`Uniform column, d0 = ${d0} m, c = ${c} m/s. Start: f = 1, P = 0 everywhere.`);
console.log(`Conserved f-integral M = ${r.M.toFixed(4)} m`);
console.log(`Theory: eta solves M = eta + g.eta^2/(2c^2)  ->  eta = ${r.etaTarget.toFixed(4)} m`
          + `  (${((d0 - r.etaTarget) / d0 * 100).toFixed(2)}% below the start)\n`);
console.log("   t (s)    |dP/dz + g|/g     |P - g(eta-z)|/g.eta     max|v|      mass drift");
console.log("   " + "-".repeat(76));
for (const [t, s, e, vm, m] of r.trace) {
  console.log("   " + t.toFixed(1).padStart(6) + "   " +
    s.toExponential(2).padStart(12) + "   " + e.toExponential(2).padStart(18) +
    "   " + vm.toExponential(2).padStart(9) + "   " + m.toExponential(1).padStart(10));
}
// If the profile is truly hydrostatic, the surface elevation implied by the
// pressure at EVERY depth, z + P/g, must be the same number. That is the
// integration constant, and it is a stronger check than comparing against a
// predicted eta, since it needs no sharp-interface assumption.
console.log("\nFinal profile. eta implied by each depth is z + P/g:");
console.log("   z (m)      P solver (m2/s2)   eta implied   vs sharp-interface eta");
console.log("   " + "-".repeat(66));
for (const [zz, Ps] of r.probes) {
  const etaImp = zz + Ps / G;
  console.log("   " + zz.toFixed(3).padStart(6) + "     " + Ps.toFixed(4).padStart(12) +
    "   " + etaImp.toFixed(5).padStart(11) + "   " +
    ((etaImp - r.etaTarget) * 1000).toFixed(2).padStart(10) + " mm");
}
const spread = Math.max(...r.probes.map(([z, P]) => z + P / G))
             - Math.min(...r.probes.map(([z, P]) => z + P / G));
console.log(`\n   spread in implied eta across the column: ${spread.toExponential(2)} m`);
console.log(`   (a single number at every depth => the profile IS hydrostatic;`);
console.log(`    the offset from the sharp-interface eta is the smeared interface,`);
console.log(`    ${((r.probes[0][0] + r.probes[0][1] / G - r.etaTarget) / 0.02).toFixed(2)} cells at dx = 0.02 m)`);
