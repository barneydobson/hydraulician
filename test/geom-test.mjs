// Zero-dependency unit tests for js/geom.js — no browser, no GPU.
// The file is a classic script defining the global GEOM, so it is loaded
// into a vm context rather than imported. Same pattern as recon-test.mjs.
import { readFileSync } from "node:fs";
import vm from "node:vm";

// GEOM_SRC points this suite at a deliberately broken copy of the module —
// that is how test/mutation-test.mjs proves each assertion below can fail.
const src = readFileSync(process.env.GEOM_SRC
  || new URL("../js/geom.js", import.meta.url), "utf8");
const ctx = { console };
vm.createContext(ctx);
vm.runInContext(src + "\n;globalThis.GEOM = GEOM;", ctx);
const GEOM = ctx.GEOM;

let passed = 0;
const failures = [];
function ok(name, cond, detail) {
  if (cond) { passed++; return true; }
  failures.push(name + (detail === undefined ? "" : "\n      " + detail));
  return false;
}
const near = (a, b, tol) => Math.abs(a - b) <= tol;

// ---- GA1: slab — a horizontal slab's 4 corners are exact (butt ends) -------
{
  const s = GEOM.slab(0, 1, 4, 1, 0.5);
  const want = [[0, 0.75], [0, 1.25], [4, 0.75], [4, 1.25]];
  const has = (x, z) => s.verts.some(v => near(v[0], x, 1e-9) && near(v[1], z, 1e-9));
  ok("GA1 slab is a 4-gon", s.verts.length === 4, JSON.stringify(s.verts));
  ok("GA1 slab has all four exact butt-end corners",
     want.every(([x, z]) => has(x, z)), JSON.stringify(s.verts));
}

// ---- GA2: winding/normal — every outward normal points away from centre ----
{
  const r = GEOM.rect(0, 0, 2, 1);
  const centre = [1, 0.5];
  let allOutward = true;
  for (let i = 0; i < r.verts.length; i++) {
    const v0 = r.verts[i], v1 = r.verts[(i + 1) % r.verts.length];
    const mid = [(v0[0] + v1[0]) / 2, (v0[1] + v1[1]) / 2];
    const [nx, nz] = GEOM.edgeNormal(r, i);
    const dot = nx * (mid[0] - centre[0]) + nz * (mid[1] - centre[1]);
    if (!(dot > 0)) allOutward = false;
  }
  ok("GA2 every edge normal on rect(0,0,2,1) points away from its centre", allOutward);
}

// ---- GA3: contains -----------------------------------------------------------
{
  const r = GEOM.rect(0, 0, 2, 1);
  ok("GA3 rect contains its interior point (1,0.5)", GEOM.contains(r, 1, 0.5));
  ok("GA3 rect does not contain (3,0.5)", !GEOM.contains(r, 3, 0.5));
  ok("GA3 rect does not contain (1,1.5)", !GEOM.contains(r, 1, 1.5));
  const sl = GEOM.slab(0, 0, 3, 3, 0.5);
  ok("GA3 (1.5,1.5) on a slanted slab's own centreline is contained",
     GEOM.contains(sl, 1.5, 1.5));
  // Negative containment: 1 mm outside each long side (half-thickness 0.25),
  // and 1 mm inside, so a slab fattened or thinned by a millimetre is caught.
  const hz = GEOM.slab(0, 1, 4, 1, 0.5);
  ok("GA3 horizontal slab: 1 mm outside each long side is out, 1 mm inside is in",
     GEOM.contains(hz, 2, 1.251) === false && GEOM.contains(hz, 2, 0.749) === false &&
     GEOM.contains(hz, 2, 1.249) === true && GEOM.contains(hz, 2, 0.751) === true);
  const k = 1 / Math.SQRT2;                    // unit normal (-k, k) of the slanted slab
  const off = (d) => [1.5 - d * k, 1.5 + d * k];
  ok("GA3 slanted slab: 1 mm outside each long side is out",
     GEOM.contains(sl, ...off(0.251)) === false && GEOM.contains(sl, ...off(-0.251)) === false &&
     GEOM.contains(sl, ...off(0.249)) === true && GEOM.contains(sl, ...off(-0.249)) === true);
}

// ---- GA4: arcPts -------------------------------------------------------------
{
  const pts = GEOM.arcPts(0, 0, 2, 0, Math.PI / 2);
  ok("GA4 arcPts starts at (2,0)", near(pts[0][0], 2, 1e-9) && near(pts[0][1], 0, 1e-9),
     JSON.stringify(pts[0]));
  const last = pts[pts.length - 1];
  ok("GA4 arcPts ends at (0,2)", near(last[0], 0, 1e-9) && near(last[1], 2, 1e-9),
     JSON.stringify(last));
  let len = 0;
  for (let i = 1; i < pts.length; i++) {
    len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  }
  ok("GA4 arcPts polyline length within 0.1% of pi",
     near(len, Math.PI, Math.PI * 0.001), `got ${len}`);
}

// ---- GA5: humpPts ------------------------------------------------------------
{
  const h = 0.4, x0 = 0, x1 = 10, n = 200;
  const pts = GEOM.humpPts(x0, x1, h, 1.0, n);
  ok("GA5 humpPts starts at zb exactly", near(pts[0][1], 1.0, 1e-12), `got ${pts[0][1]}`);
  ok("GA5 humpPts ends at zb exactly", near(pts[n][1], 1.0, 1e-12), `got ${pts[n][1]}`);
  const mid = pts[n / 2];
  ok("GA5 humpPts peaks at zb+h at the midpoint", near(mid[1], 1.0 + h, 1e-9), `got ${mid[1]}`);
  ok("GA5 humpPts is symmetric about the midpoint",
     near(pts[10][1] - 1.0, pts[n - 10][1] - 1.0, 1e-9),
     `${pts[10][1] - 1.0} vs ${pts[n - 10][1] - 1.0}`);
  ok("GA5 humpPts has ~zero end slope for n=200",
     Math.abs(pts[1][1] - pts[0][1]) < h * 1e-3, `got ${pts[1][1] - pts[0][1]}`);
}

// ---- GA6: faceSamples on rect's "left" face ----------------------------------
{
  const r = GEOM.rect(0, 0, 2, 1);
  const ds = 0.3;
  const samples = GEOM.faceSamples(r, "left", ds);
  // The left face is one edge of length 1: exactly max(2, ceil(L/ds)) samples.
  // ds = 0.3 gives ceil(3.33) = 4; a ds longer than the edge hits the floor of 2.
  ok("GA6 faceSamples count is ceil(L/ds) = 4 for L = 1, ds = 0.3",
     samples.length === Math.max(2, Math.ceil(1 / ds)) && samples.length === 4,
     `got ${samples.length}`);
  ok("GA6 faceSamples count is floored at 2 when ds exceeds the edge length",
     GEOM.faceSamples(r, "left", 5).length === 2,
     `got ${GEOM.faceSamples(r, "left", 5).length}`);
  ok("GA6 faceSamples normals are all (-1,0) on the left face",
     samples.every(s => near(s.nx, -1, 1e-9) && near(s.nz, 0, 1e-9)),
     JSON.stringify(samples.map(s => [s.nx, s.nz])));
  let sIncreasing = true, spacingOk = true;
  for (let i = 1; i < samples.length; i++) {
    if (!(samples[i].s > samples[i - 1].s)) sIncreasing = false;
    if (samples[i].s - samples[i - 1].s > ds + 1e-9) spacingOk = false;
  }
  ok("GA6 faceSamples s is strictly increasing", sIncreasing);
  ok("GA6 faceSamples spacing does not exceed ds", spacingOk);
}

// ---- GA7: faceAt --------------------------------------------------------------
{
  const r = GEOM.rect(0, 0, 2, 1);
  const hit = GEOM.faceAt([r], -0.05, 0.5, 0.2);
  ok("GA7 faceAt finds \"left\" just outside the rect", hit && hit.faceId === "left",
     JSON.stringify(hit));
  const miss = GEOM.faceAt([r], 5, 5, 0.2);
  ok("GA7 faceAt returns null out of tolerance", miss === null, JSON.stringify(miss));
}

// ---- GA8: hydrostatic closed form on a vertical face --------------------------
// rect(0,0,1,2)'s "left" face: p = g(H-z), f = 1 below H=2 (the whole face).
// Classic triangular pressure distribution: F = rho*g*H^2/2, cop at H/3.
{
  const r = GEOM.rect(0, 0, 1, 2);
  const ds = 0.05;
  const samples = GEOM.faceSamples(r, "left", ds);
  const H = 2, g = 9.81, rho = 1000;
  for (const s of samples) { s.p = g * (H - s.z); s.f = 1; }
  const { Fx, Fz, cop } = GEOM.faceForceFromSamples(samples, ds, rho, g);
  const expectFx = 0.5 * rho * g * H * H;
  ok("GA8 hydrostatic Fx = rho*g*H^2/2 = 19620 N/m",
     near(Fx, expectFx, expectFx * 0.005), `got ${Fx} want ${expectFx}`);
  ok("GA8 hydrostatic Fz ~ 0 on a vertical face",
     Math.abs(Fz) < expectFx * 1e-6, `got ${Fz}`);
  ok("GA8 centre of pressure lands at H/3", cop && near(cop.z, H / 3, 0.02),
     JSON.stringify(cop));
}

// ---- GA10: poly fills a missing face label from its id ----------------------
{
  const p = GEOM.poly([[0, 0], [1, 0], [1, 1]],
                      [{ id: "a", e0: 0, e1: 0 }, { id: "b", label: "Bee", e0: 1, e1: 1 }], "t");
  ok("GA10 poly fills a missing label from the face id, keeps a given one",
     p.faces[0].label === "a" && p.faces[1].label === "Bee",
     JSON.stringify(p.faces));
}

// ---- GA11: faceForceFromSamples with a partially-filled sample --------------
// Four samples on a vertical face (normal (-1,0)), ds = 0.5, at z = 0.25, 0.75,
// 1.25, 1.75 under a surface at H = 2: p = g*(2-z) = g*[1.75, 1.25, 0.75, 0.25],
// f = [1, 1, 0.5, 0]. dFx = -fc*rho*p*nx*ds = +fc*rho*p*ds, so
//   Fx = 1000 * 0.5 * 9.81 * (1*1.75 + 1*1.25 + 0.5*0.75 + 0*0.25)
//      = 4905 * 3.375 = 16554.375 N/m.
// The wet length counts ds for every sample with fc*p > 0 (the half-filled
// third counts whole, the empty fourth not at all): 3 ds = 1.5.
{
  const ds = 0.5, g = 9.81, rho = 1000;
  const f = [1, 1, 0.5, 0];
  const samples = f.map((fi, k) => {
    const z = 0.25 + 0.5 * k;
    return { x: 0, z, nx: -1, nz: 0, s: z, p: g * (2 - z), f: fi };
  });
  const out = GEOM.faceForceFromSamples(samples, ds, rho, g);
  ok("GA11 partial fill: Fx weights the third sample by fc = 0.5 (16554.375)",
     near(out.Fx, 16554.375, 1e-6), `got ${out.Fx}`);
  ok("GA11 partial fill: wetLen counts the three samples with fc*p > 0",
     near(out.wetLen, 3 * ds, 1e-12), `got ${out.wetLen}`);
  // An over-full sample (f = 1.5) is capped at 1: same force as f = 1.
  const over = samples.map(s => ({ ...s, f: s.f === 1 ? 1.5 : s.f }));
  ok("GA11 an over-full sample is capped at fc = 1",
     near(GEOM.faceForceFromSamples(over, ds, rho, g).Fx, 16554.375, 1e-6));
}

// ---- GA9: face wrap ------------------------------------------------------------
{
  const r = GEOM.rect(0, 0, 1, 1, { faces: [{ id: "wrap", e0: 3, e1: 0 }] });
  ok("GA9 a face {e0:3,e1:0} on a 4-gon resolves to edges [3,0]",
     JSON.stringify(GEOM.faceEdges(r, "wrap")) === JSON.stringify([3, 0]),
     JSON.stringify(GEOM.faceEdges(r, "wrap")));
}

console.log(`${passed} passed, ${failures.length} failed`);
if (failures.length) { for (const f of failures) console.error("  FAIL " + f); process.exit(1); }
