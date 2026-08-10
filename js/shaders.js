"use strict";
/**
 * shaders.js — all GLSL for the vertical-plane hydraulics solver.
 *
 * MODEL: barotropic weakly-compressible Navier–Stokes on a staggered (MAC)
 * grid, with the cell fill fraction `f` doubling as the density.
 *
 *     ∂f/∂t + ∇·(f u) = 0                      exact, flux form
 *     ∂u/∂t + (u·∇)u  = −∇p/ρ + g + ∇·(ν∇u) − C_f|u|u/Δ
 *     p/ρ = c² max(f − 1, 0)                   equation of state
 *
 * The EOS is the whole trick. f < 1 means the cell is not full, so p = 0 and
 * the fluid falls freely — that IS the free surface, no interface tracking
 * needed for the pressure BC. f > 1 means the cell is over-full, i.e. the
 * water has been compressed: pressure builds and travels at celerity c. That
 * is a 2D Preissmann slot — c plays the role of the slot width, giving
 * finite-speed pressure waves (water hammer) and an automatic transition
 * between free-surface and pressurised flow in the same equations.
 *
 * PASSES per substep: `vel` then `vof`. Both are single fullscreen draws.
 * Velocity advection is 3rd-order upwind (low dissipation — jets stay crisp);
 * f advection is superbee-limited flux form plus an interFoam-style
 * compression flux (keeps the free surface ~2 cells thick).
 */
const Shaders = (() => {

  // ---------------------------------------------------------------- vertex
  const VS_QUAD = `#version 300 es
out vec2 vUv;
void main(){
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

  // Letterbox quad: the domain is a fixed physical rectangle, so the display
  // covers only the NDC rect that preserves its aspect.
  const VS_RECT = `#version 300 es
uniform vec4 u_rect;          // x0, y0, x1, y1 in NDC
out vec2 vUv;
vec2 corner(int id){
  if (id == 0) return vec2(0.0, 0.0);
  if (id == 1) return vec2(1.0, 0.0);
  if (id == 2) return vec2(0.0, 1.0);
  if (id == 3) return vec2(0.0, 1.0);
  if (id == 4) return vec2(1.0, 0.0);
  return vec2(1.0, 1.0);
}
void main(){
  vec2 q = corner(gl_VertexID);
  vUv = q;
  gl_Position = vec4(mix(u_rect.xy, u_rect.zw, q), 0.0, 1.0);
}`;

  // -------------------------------------------------------------- prelude
  // Shared by the two simulation passes. Texture channel contract:
  //   u_U  RGBA32F   r = u at the WEST face of this cell
  //                  g = v at the SOUTH face of this cell
  //                  b = p/ρ at the cell centre (m²/s², diagnostic)
  //                  a = ∇·u at the cell centre (diagnostic)
  //   u_F  RGBA32F   r = f (fill fraction / density)
  //                  g = dye A   b = dye B   a = spare
  //   u_S  R8        0 = open, 0.5 = valve, 1 = wall
  const SIM_HEAD = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUv;
out vec4 o;

uniform sampler2D u_U, u_F, u_S;
uniform vec2  u_res;          // NX, NY
uniform float u_dx, u_dt;
uniform float u_g;            // signed gravity (m/s², negative = down; 0 = plan view)
uniform float u_c, u_c2;      // slot celerity and its square
uniform float u_valve;        // 1 = valves closed (solid), 0 = open
uniform vec4  u_open;         // L R B T : 1 = open boundary
uniform vec4  u_in;           // left reservoir: level (m), velocity (m/s), on, free
                              // free = 1 pins the level only and lets the head drive the flow
uniform vec2  u_tw;           // right tailwater: level (m), on
uniform vec4  u_src0, u_src1; // point sources: x, y, radius (m), on
uniform vec4  u_sv0,  u_sv1;  // source velocity x, y and dye A, dye B
uniform float u_time;

ivec2 NXY;
ivec2 CL(ivec2 c){ return clamp(c, ivec2(0), NXY - ivec2(1)); }
vec4  TU(ivec2 c){ return texelFetch(u_U, CL(c), 0); }
vec4  TF(ivec2 c){ return texelFetch(u_F, CL(c), 0); }
float SO(ivec2 c){
  float s = texelFetch(u_S, CL(c), 0).r;
  return s > 0.75 ? 1.0 : (s > 0.25 ? u_valve : 0.0);
}
`;

  // ------------------------------------------------------- pass 1: velocity
  // Advection + viscosity + gravity + bed friction + pressure gradient, all
  // in one draw. Everything is explicit; the staggered arrangement is what
  // makes the acoustic update stable without a Poisson solve.
  const FS_VEL = SIM_HEAD + `
uniform float u_nu;      // background kinematic viscosity (m²/s)
uniform float u_cs;      // Smagorinsky constant (0 = laminar)
uniform float u_cf;      // bed friction coefficient
uniform float u_slip;    // 0 = no-slip walls, 1 = free-slip
uniform float u_bulk;    // artificial bulk viscosity (damps pressure waves)
uniform vec4  u_wave;    // amplitude (m), omega (rad/s), on, piston column

// 3rd-order upwind derivative — O(dx³) dissipation, so jets and shear layers
// survive the thousands of substeps a water-hammer run needs.
float ud3(float m2, float m1, float c0, float p1, float p2, float a, float h){
  return a >= 0.0 ? ( 2.0*p1 + 3.0*c0 - 6.0*m1 + m2) / (6.0*h)
                  : (-p2 + 6.0*p1 - 3.0*c0 - 2.0*m1) / (6.0*h);
}

// Kinematic pressure from the equation of state, plus a bulk-viscosity term
// that attenuates acoustics (the "wave damping" slider). Clamped at zero:
// a cell that cannot stay full simply cavitates, which is what really
// happens downstream of a slammed valve.
float press(float f, float dv){
  float p = u_c2 * max(f - 1.0, 0.0);
  p -= u_bulk * u_c * u_dx * dv * smoothstep(0.90, 1.0, f);
  return max(p, 0.0);
}

void main(){
  NXY = ivec2(u_res);
  ivec2 c = ivec2(gl_FragCoord.xy);
  int i = c.x, j = c.y;
  float dx = u_dx, dt = u_dt;

  // --- the 11-texel stencil both components need
  vec4 t0  = TU(c);
  vec4 tW  = TU(ivec2(i-1, j  )), tE  = TU(ivec2(i+1, j  ));
  vec4 tS  = TU(ivec2(i,   j-1)), tN  = TU(ivec2(i,   j+1));
  vec4 tWW = TU(ivec2(i-2, j  )), tEE = TU(ivec2(i+2, j  ));
  vec4 tSS = TU(ivec2(i,   j-2)), tNN = TU(ivec2(i,   j+2));
  vec4 tNW = TU(ivec2(i-1, j+1)), tSE = TU(ivec2(i+1, j-1));

  float u0 = t0.r, v0 = t0.g;
  float fC = TF(c).r, fW = TF(ivec2(i-1,j)).r, fS = TF(ivec2(i,j-1)).r;
  float sC = SO(c),   sW = SO(ivec2(i-1,j)),   sS = SO(ivec2(i,j-1));

  // --- transverse velocity interpolated onto each face node
  float vAtU = 0.25 * (tW.g + t0.g + tNW.g + tN.g);
  float uAtV = 0.25 * (tS.r + t0.r + tSE.r + tE.r);

  // --- advection
  float un = u0 - dt * ( u0    * ud3(tWW.r, tW.r, u0, tE.r, tEE.r, u0,    dx)
                       + vAtU  * ud3(tSS.r, tS.r, u0, tN.r, tNN.r, vAtU,  dx) );
  float vn = v0 - dt * ( uAtV  * ud3(tWW.g, tW.g, v0, tE.g, tEE.g, uAtV,  dx)
                       + v0    * ud3(tSS.g, tS.g, v0, tN.g, tNN.g, v0,    dx) );

  // --- eddy viscosity (Smagorinsky). Without this the velocity–depth
  //     profile stays laminar-parabolic instead of turbulent-flat.
  float dudx = (tE.r - t0.r) / dx;
  float dvdy = (tN.g - t0.g) / dx;
  float sxy  = 0.5 * ((tN.r - tS.r) + (tE.g - tW.g)) / (2.0 * dx);
  float smag = sqrt(2.0*(dudx*dudx + dvdy*dvdy) + 4.0*sxy*sxy);
  float nuT  = u_nu + (u_cs*dx)*(u_cs*dx)*smag;

  // --- wall-aware Laplacian: a solid neighbour reflects (no-slip) or mirrors
  float wUp = max(SO(ivec2(i,j+1)), SO(ivec2(i-1,j+1)));
  float wDn = max(SO(ivec2(i,j-1)), SO(ivec2(i-1,j-1)));
  float wLf = max(SO(ivec2(i-1,j)), SO(ivec2(i-1,j-1)));
  float wRt = max(SO(ivec2(i+1,j)), SO(ivec2(i+1,j-1)));
  float ghost = mix(-1.0, 1.0, u_slip);
  float uN = mix(tN.r, ghost*u0, wUp), uS = mix(tS.r, ghost*u0, wDn);
  float vL = mix(tW.g, ghost*v0, wLf), vR = mix(tE.g, ghost*v0, wRt);
  un += dt * nuT * (tE.r + tW.r + uN + uS - 4.0*u0) / (dx*dx);
  vn += dt * nuT * (vR + vL + tN.g + tS.g - 4.0*v0) / (dx*dx);

  // --- gravity, only where there is water to pull on
  float fFu = max(fC, fW), fFv = max(fC, fS);
  vn += dt * u_g * smoothstep(0.0, 0.05, fFv);

  // --- bed friction: a wall function applied in the cells touching a solid,
  //     integrated implicitly so any roughness is stable
  float spU = sqrt(un*un + vAtU*vAtU) + 1e-6;
  float spV = sqrt(vn*vn + uAtV*uAtV) + 1e-6;
  un /= 1.0 + dt * u_cf * spU * max(wUp, wDn) / dx;
  vn /= 1.0 + dt * u_cf * spV * max(wLf, wRt) / dx;

  // --- pressure gradient (three cell-centred divergences from the stencil)
  float dvC = (tE.r  - t0.r + tN.g  - t0.g) / dx;
  float dvW = (t0.r  - tW.r + tNW.g - tW.g) / dx;
  float dvS = (tSE.r - tS.r + t0.g  - tS.g) / dx;
  float pC = press(fC, dvC);
  un -= dt * (pC - press(fW, dvW)) / dx;
  vn -= dt * (pC - press(fS, dvS)) / dx;

  // --- void handling. Hard-zeroing the velocity in empty cells makes the air
  //     behave like a rigid medium, and the fake shear layer shreds any free
  //     jet within a metre of leaving its nozzle. Instead let the velocity
  //     advect and diffuse out into the void — a cheap standing-in for the
  //     usual free-surface velocity extrapolation — and only bleed it away
  //     slowly, so still air stays still. Nothing forces a void (gravity and
  //     ∇p are both gated on f), so this cannot run away.
  float dryU = 1.0 - smoothstep(0.0, 0.02, fFu);
  float dryV = 1.0 - smoothstep(0.0, 0.02, fFv);
  un *= 1.0 - min(dt * 1.5 * dryU, 1.0);
  vn *= 1.0 - min(dt * 1.5 * dryV, 1.0);

  // --- prescribed sources
  vec2 pu = vec2(float(i),       float(j) + 0.5) * dx;   // u-node position
  vec2 pv = vec2(float(i) + 0.5, float(j)      ) * dx;   // v-node position
  if (u_src0.w > 0.5) {
    if (distance(pu, u_src0.xy) < u_src0.z) un = u_sv0.x;
    if (distance(pv, u_src0.xy) < u_src0.z) vn = u_sv0.y;
  }
  if (u_src1.w > 0.5) {
    if (distance(pu, u_src1.xy) < u_src1.z) un = u_sv1.x;
    if (distance(pv, u_src1.xy) < u_src1.z) vn = u_sv1.y;
  }
  if (u_in.z > 0.5 && u_in.w < 0.5 && i == 1) un = (pu.y < u_in.x) ? u_in.y : 0.0;
  if (u_wave.z > 0.5 && i == int(u_wave.w) && fFu > 0.5) {
    un = u_wave.x * u_wave.y * cos(u_wave.y * u_time);   // piston wavemaker
  }

  // --- no flux through solids; outermost faces are outside the domain
  if (sC > 0.5 || sW > 0.5) un = 0.0;
  if (sC > 0.5 || sS > 0.5) vn = 0.0;
  if (i == 0) un = 0.0;
  if (j == 0) vn = 0.0;

  // Belt and braces: one NaN anywhere poisons the whole field for good, and
  // a scene that has silently died is worse than one that clips. Written as
  // an explicit range test rather than isnan() or a self-comparison, both of
  // which a fast-math shader compiler is entitled to fold away.
  un = (un > -80.0 && un < 80.0) ? un : (un > 0.0 ? 80.0 : (un < 0.0 ? -80.0 : 0.0));
  vn = (vn > -80.0 && vn < 80.0) ? vn : (vn > 0.0 ? 80.0 : (vn < 0.0 ? -80.0 : 0.0));
  o = vec4(un, vn, pC, dvC);
}`;

  // ------------------------------------------------------------ pass 2: VOF
  // Flux-form advection of f. Because both neighbours of a face compute the
  // identical face flux, total volume is conserved to machine precision —
  // that is what makes the mass-balance readout trustworthy.
  const FS_VOF = SIM_HEAD + `
uniform float u_ca;        // interface compression strength
uniform float u_dyeDecay;  // 1/s
uniform vec2  u_dyeLine;   // period (s), on — pulsed dye timelines at the inlet

// van Leer. Superbee is tempting here but it is over-compressive: it turns the
// smooth thinning of an accelerating jet into a 0/1 staircase. Interface
// sharpening is the compression flux's job, not the limiter's.
float lim(float r){ return (r + abs(r)) / (1.0 + abs(r)); }

// Limited value on the face between cells fm and fp, advected at speed a.
float faceVal(float fmm, float fm, float fp, float fpp, float a){
  float d = fp - fm;
  if (abs(d) < 1e-12) return fm;
  if (a >= 0.0) return fm + 0.5 * lim((fm - fmm) / d) * d;
  else          return fp + 0.5 * lim((fp - fpp) / -d) * -d;
}

void main(){
  NXY = ivec2(u_res);
  ivec2 c = ivec2(gl_FragCoord.xy);
  int i = c.x, j = c.y;
  float dx = u_dx, dt = u_dt;
  float x = (float(i) + 0.5) * dx, y = (float(j) + 0.5) * dx;
  float gz = abs(u_g);

  if (SO(c) > 0.5) { o = vec4(0.0); return; }

  // --- ghost ring: zero-gradient outflow, or a Dirichlet level control
  bool gL = (i == 0), gR = (i == NXY.x - 1), gB = (j == 0), gT = (j == NXY.y - 1);
  if (gL || gR || gB || gT) {
    ivec2 s = c;
    if (gL) s.x = 1; if (gR) s.x = NXY.x - 2;
    if (gB) s.y = 1; if (gT) s.y = NXY.y - 2;
    vec4 m = TF(s);
    if (gL && u_in.z > 0.5) {               // upstream reservoir
      m.r = (y < u_in.x) ? 1.0 + gz * (u_in.x - y) / u_c2 : 0.0;
      m.g = (u_dyeLine.y > 0.5 && fract(u_time / max(u_dyeLine.x, 0.05)) < 0.07) ? 1.0 : 0.0;
      m.b = 0.0;
    }
    if (gR && u_tw.y > 0.5) {               // downstream level control
      m.r = (y < u_tw.x) ? 1.0 + gz * (u_tw.x - y) / u_c2 : 0.0;
    }
    o = m; return;
  }

  // --- stencil (f in .r, dyes in .g/.b — one fetch serves both)
  vec4 F0 = TF(c);
  vec4 Fw = TF(ivec2(i-1,j  )), Fe = TF(ivec2(i+1,j  ));
  vec4 Fs = TF(ivec2(i,  j-1)), Fn = TF(ivec2(i,  j+1));
  float fWW = TF(ivec2(i-2,j)).r, fEE = TF(ivec2(i+2,j)).r;
  float fSS = TF(ivec2(i,j-2)).r, fNN = TF(ivec2(i,j+2)).r;
  float aNW = min(TF(ivec2(i-1,j+1)).r, 1.0), aSW = min(TF(ivec2(i-1,j-1)).r, 1.0);
  float aNE = min(TF(ivec2(i+1,j+1)).r, 1.0), aSE = min(TF(ivec2(i+1,j-1)).r, 1.0);

  float fC = F0.r;
  float uW = TU(c).r, uE = TU(ivec2(i+1,j)).r;
  float vS = TU(c).g, vN = TU(ivec2(i,j+1)).g;

  // --- limited upwind face values
  float ffW = faceVal(fWW, Fw.r, fC,   Fe.r, uW);
  float ffE = faceVal(Fw.r, fC,  Fe.r, fEE,  uE);
  float ffS = faceVal(fSS, Fs.r, fC,   Fn.r, vS);
  float ffN = faceVal(Fs.r, fC,  Fn.r, fNN,  vN);

  // --- interface compression: an artificial velocity c_α|u| along ∇α that
  //     pushes the smeared interface back together. α(1−α) switches it off
  //     everywhere except the free surface itself.
  float aC = min(fC, 1.0), aW = min(Fw.r, 1.0), aE = min(Fe.r, 1.0);
  float aS = min(Fs.r, 1.0), aN = min(Fn.r, 1.0);
  float cW = 0.0, cE = 0.0, cS = 0.0, cN = 0.0;
  if (u_ca > 0.0) {
    float gx, gy, gm, am;
    gx = (aC - aW) / dx;  gy = ((aNW + aN) - (aSW + aS)) / (4.0*dx);
    gm = sqrt(gx*gx + gy*gy) + 1e-8;  am = 0.5*(aC + aW);
    cW = u_ca * abs(uW) * am * (1.0 - am) * gx / gm;
    gx = (aE - aC) / dx;  gy = ((aN + aNE) - (aS + aSE)) / (4.0*dx);
    gm = sqrt(gx*gx + gy*gy) + 1e-8;  am = 0.5*(aE + aC);
    cE = u_ca * abs(uE) * am * (1.0 - am) * gx / gm;
    gy = (aC - aS) / dx;  gx = ((aSE + aE) - (aSW + aW)) / (4.0*dx);
    gm = sqrt(gx*gx + gy*gy) + 1e-8;  am = 0.5*(aC + aS);
    cS = u_ca * abs(vS) * am * (1.0 - am) * gy / gm;
    gy = (aN - aC) / dx;  gx = ((aNE + aE) - (aNW + aW)) / (4.0*dx);
    gm = sqrt(gx*gx + gy*gy) + 1e-8;  am = 0.5*(aN + aC);
    cN = u_ca * abs(vN) * am * (1.0 - am) * gy / gm;
  }

  // Donor-cell positivity limiter. A cell can only lose through four faces,
  // so capping each outgoing flux at a quarter of the donor's contents
  // guarantees f never goes negative — WITHOUT a clamp. That distinction is
  // the whole ball game: clamping a negative f back to zero invents water,
  // and at a few thousand substeps a second across every surface and spray
  // cell in the domain it invents a *lot* of it. This version is exactly
  // conservative because both neighbours of a face pick the same donor from
  // the sign of the same flux, and therefore agree on the same limit.
  float lim4 = 0.25 * dx / dt;
  float FW = uW*ffW + cW, FE = uE*ffE + cE;
  float FS = vS*ffS + cS, FN = vN*ffN + cN;
  FW = clamp(FW, -lim4 * fC,   lim4 * Fw.r);
  FE = clamp(FE, -lim4 * Fe.r, lim4 * fC);
  FS = clamp(FS, -lim4 * fC,   lim4 * Fs.r);
  FN = clamp(FN, -lim4 * Fn.r, lim4 * fC);
  float fNew = min(fC - dt * ((FE - FW) + (FN - FS)) / dx, 8.0);

  // --- dye rides along (advective form, first-order upwind is plenty)
  float div = ((uE - uW) + (vN - vS)) / dx;
  vec2 dC = F0.gb;
  vec2 dWu = uW > 0.0 ? Fw.gb : dC, dEu = uE > 0.0 ? dC : Fe.gb;
  vec2 dSu = vS > 0.0 ? Fs.gb : dC, dNu = vN > 0.0 ? dC : Fn.gb;
  vec2 dNew = dC - dt * ((uE*dEu - uW*dWu + vN*dNu - vS*dSu) / dx - dC*div);
  dNew *= 1.0 - dt * u_dyeDecay;
  dNew = clamp(dNew, 0.0, 1.0);

  // --- point sources add volume and colour
  if (u_src0.w > 0.5 && distance(vec2(x,y), u_src0.xy) < u_src0.z) {
    fNew = max(fNew, 1.0); dNew = max(dNew, u_sv0.zw);
  }
  if (u_src1.w > 0.5 && distance(vec2(x,y), u_src1.xy) < u_src1.z) {
    fNew = max(fNew, 1.0); dNew = max(dNew, u_sv1.zw);
  }

  fNew = (fNew > 0.0 && fNew < 8.0) ? fNew : (fNew >= 8.0 ? 8.0 : 0.0);
  o = vec4(fNew, dNew, 0.0);
}`;

  // ------------------------------------------------- pass 3: column reduce
  // One texel per grid column: bed level, depth, unit discharge, surface.
  // Everything the open-channel overlay needs (y_c, y_n, Fr, energy line)
  // is derived from these four numbers on the CPU.
  const FS_COL = `#version 300 es
precision highp float;
precision highp sampler2D;
out vec4 o;
uniform sampler2D u_U, u_F, u_S;
uniform vec2  u_res;
uniform float u_dx, u_valve;

float SO(ivec2 c){
  float s = texelFetch(u_S, c, 0).r;
  return s > 0.75 ? 1.0 : (s > 0.25 ? u_valve : 0.0);
}

void main(){
  int i  = int(gl_FragCoord.x);
  int NY = int(u_res.y);

  // Bed = the floor the water is actually standing on, found by looking for
  // the lowest wet cell rather than the lowest non-solid one. A flume bed
  // raised above the domain floor, a pipe over a channel, water perched on a
  // weir crest — all of them break the naive "first solid from the bottom".
  int jb = -1;
  for (int j = 1; j < NY - 1; j++) {
    if (SO(ivec2(i,j)) < 0.5 && texelFetch(u_F, ivec2(i,j), 0).r > 0.25) { jb = j; break; }
  }
  if (jb < 0) {                               // dry column: report the ground
    int jg = NY - 2;
    for (int j = 1; j < NY - 1; j++) { if (SO(ivec2(i,j)) < 0.5) { jg = j; break; } }
    o = vec4(float(jg) * u_dx, 0.0, 0.0, float(jg) * u_dx);
    return;
  }
  // Walk up the connected water body only. Spray and nappes higher up the
  // column are not part of the depth, and letting them in makes the surface
  // elevation — and everything derived from it — jump about.
  float h = 0.0, q = 0.0, top = float(jb) * u_dx;
  int dry = 0;
  for (int j = jb; j < NY - 1; j++) {
    if (SO(ivec2(i,j)) > 0.5) break;          // soffit / obstruction
    float f  = min(texelFetch(u_F, ivec2(i,j), 0).r, 1.0);
    if (f < 0.25) { dry++; if (dry > 2) break; continue; }
    dry = 0;
    float uc = 0.5 * (texelFetch(u_U, ivec2(i,  j), 0).r
                    + texelFetch(u_U, ivec2(i+1,j), 0).r);
    h += f * u_dx;
    q += f * uc * u_dx;
    if (f > 0.5) top = (float(j) + 1.0) * u_dx;
  }
  o = vec4(float(jb) * u_dx, h, q, top);
}`;

  // ------------------------------------------------------------- particles
  const FS_PART = `#version 300 es
precision highp float;
precision highp sampler2D;
out vec4 o;
uniform sampler2D u_P, u_U, u_F, u_S;
uniform vec2  u_res, u_pres;
uniform float u_dx, u_pdt, u_plife, u_time, u_valve;

float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

vec2 velAt(vec2 pos){
  vec2 g = pos / u_dx;
  vec2 lo = vec2(0.0), hi = u_res - vec2(1.001);
  vec2 pu = clamp(vec2(g.x,       g.y - 0.5), lo, hi);   // u lives on x-faces
  vec2 pv = clamp(vec2(g.x - 0.5, g.y      ), lo, hi);
  ivec2 iu = ivec2(pu); vec2 fu = pu - vec2(iu);
  ivec2 iv = ivec2(pv); vec2 fv = pv - vec2(iv);
  float u = mix(mix(texelFetch(u_U, iu,             0).r, texelFetch(u_U, iu+ivec2(1,0), 0).r, fu.x),
                mix(texelFetch(u_U, iu+ivec2(0,1),  0).r, texelFetch(u_U, iu+ivec2(1,1), 0).r, fu.x), fu.y);
  float v = mix(mix(texelFetch(u_U, iv,             0).g, texelFetch(u_U, iv+ivec2(1,0), 0).g, fv.x),
                mix(texelFetch(u_U, iv+ivec2(0,1),  0).g, texelFetch(u_U, iv+ivec2(1,1), 0).g, fv.x), fv.y);
  return vec2(u, v);
}

void main(){
  ivec2 c = ivec2(gl_FragCoord.xy);
  vec4 p = texelFetch(u_P, c, 0);
  vec2 dom = u_res * u_dx;

  p.xy += velAt(p.xy) * u_pdt;
  p.z  += u_pdt;

  ivec2 g = ivec2(clamp(p.xy / u_dx, vec2(0.0), u_res - vec2(1.0)));
  float s = texelFetch(u_S, g, 0).r;
  bool solid = s > 0.75 || (s > 0.25 && u_valve > 0.5);
  bool wet   = texelFetch(u_F, g, 0).r > 0.35;

  if (p.z > u_plife || solid || !wet ||
      p.x < 0.0 || p.y < 0.0 || p.x > dom.x || p.y > dom.y) {
    vec2 seed = vec2(p.w, u_time);
    p.xy = vec2(hash(seed), hash(seed + 7.3)) * dom;
    p.z  = -hash(seed + 3.1) * u_plife;       // negative age = invisible until born
  }
  o = p;
}`;

  const VS_PART = `#version 300 es
precision highp float;
precision highp sampler2D;
uniform sampler2D u_P, u_U;
uniform vec2  u_pres, u_res;
uniform vec4  u_rect;
uniform float u_dx, u_psize;
out float vSpeed;
out float vFade;
void main(){
  ivec2 c = ivec2(gl_VertexID % int(u_pres.x), gl_VertexID / int(u_pres.x));
  vec4 p = texelFetch(u_P, c, 0);
  vec2 dom = u_res * u_dx;
  vec2 uv  = p.xy / dom;
  ivec2 g = ivec2(clamp(p.xy / u_dx, vec2(0.0), u_res - vec2(1.0)));
  vec4 t  = texelFetch(u_U, g, 0);
  vSpeed = length(t.rg);
  vFade  = smoothstep(0.0, 0.15, p.z) * (p.z > 0.0 ? 1.0 : 0.0);
  gl_Position  = vec4(mix(u_rect.xy, u_rect.zw, uv), 0.0, 1.0);
  gl_PointSize = u_psize;
}`;

  const FS_PART_DRAW = `#version 300 es
precision highp float;
in float vSpeed;
in float vFade;
out vec4 o;
uniform float u_vmax;
void main(){
  vec2 d = gl_PointCoord - 0.5;
  float a = smoothstep(0.5, 0.15, length(d) * 2.0) * vFade;
  float t = clamp(vSpeed / max(u_vmax, 0.01), 0.0, 1.0);
  vec3 col = mix(vec3(0.55, 0.80, 1.00), vec3(1.00, 0.94, 0.72), t);
  o = vec4(col * (0.35 + 0.65 * t), a * 0.75);
}`;

  // ----------------------------------------------------------------- display
  const FS_DISP = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUv;
out vec4 o;

uniform sampler2D u_F, u_U, u_S, u_C;
uniform vec2  u_res, u_canvas;
uniform float u_dx, u_g, u_c2, u_valve, u_time;
uniform int   u_mode;         // 0 water 1 head 2 speed 3 Froude 4 vorticity
uniform float u_vmax, u_hmax; // colour-scale maxima
uniform float u_dyeOn;
uniform vec4  u_cursor;       // x, y (m), radius (m), tool tint
uniform vec4  u_guide;        // preview line x0,y0,x1,y1 (m); w<0 = off
uniform float u_guideOn;

vec4 blF(vec2 g){
  g -= 0.5;
  ivec2 i = ivec2(floor(g)); vec2 f = g - vec2(i);
  ivec2 lo = ivec2(0), hi = ivec2(u_res) - ivec2(1);
  vec4 a = texelFetch(u_F, clamp(i,             lo, hi), 0);
  vec4 b = texelFetch(u_F, clamp(i+ivec2(1,0),  lo, hi), 0);
  vec4 c = texelFetch(u_F, clamp(i+ivec2(0,1),  lo, hi), 0);
  vec4 d = texelFetch(u_F, clamp(i+ivec2(1,1),  lo, hi), 0);
  return mix(mix(a,b,f.x), mix(c,d,f.x), f.y);
}
vec4 blU(vec2 g){
  g -= 0.5;
  ivec2 i = ivec2(floor(g)); vec2 f = g - vec2(i);
  ivec2 lo = ivec2(0), hi = ivec2(u_res) - ivec2(1);
  vec4 a = texelFetch(u_U, clamp(i,             lo, hi), 0);
  vec4 b = texelFetch(u_U, clamp(i+ivec2(1,0),  lo, hi), 0);
  vec4 c = texelFetch(u_U, clamp(i+ivec2(0,1),  lo, hi), 0);
  vec4 d = texelFetch(u_U, clamp(i+ivec2(1,1),  lo, hi), 0);
  return mix(mix(a,b,f.x), mix(c,d,f.x), f.y);
}
float solAt(vec2 g){
  ivec2 i = ivec2(clamp(g, vec2(0.0), u_res - vec2(1.0)));
  float s = texelFetch(u_S, i, 0).r;
  return s > 0.75 ? 1.0 : (s > 0.25 ? 1.0 : 0.0);
}
float valveAt(vec2 g){
  ivec2 i = ivec2(clamp(g, vec2(0.0), u_res - vec2(1.0)));
  float s = texelFetch(u_S, i, 0).r;
  return (s > 0.25 && s < 0.75) ? 1.0 : 0.0;
}

vec3 ramp(float t, vec3 a, vec3 b, vec3 c, vec3 d, vec3 e){
  t = clamp(t, 0.0, 1.0) * 4.0;
  if (t < 1.0) return mix(a, b, t);
  if (t < 2.0) return mix(b, c, t - 1.0);
  if (t < 3.0) return mix(c, d, t - 2.0);
  return mix(d, e, t - 3.0);
}
vec3 turbo(float t){
  return ramp(t, vec3(0.19,0.07,0.23), vec3(0.13,0.56,0.82),
                 vec3(0.20,0.83,0.48), vec3(0.95,0.78,0.15), vec3(0.85,0.14,0.10));
}
vec3 divg(float t){   // blue → pale → red, break at 0.5 (Froude = 1)
  return ramp(t, vec3(0.06,0.24,0.52), vec3(0.25,0.61,0.85),
                 vec3(0.94,0.95,0.92), vec3(0.97,0.63,0.25), vec3(0.72,0.10,0.09));
}

float segDist(vec2 p, vec2 a, vec2 b){
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-9), 0.0, 1.0);
  return length(pa - ba * h);
}

void main(){
  vec2 uv = vUv;
  vec2 g  = uv * u_res;                       // grid coords
  vec2 pm = uv * u_res * u_dx;                // metres
  float px = u_dx * u_res.x / u_canvas.x;     // metres per screen pixel

  vec4 F = blF(g);
  vec4 U = blU(g);
  float f = F.r;
  float sol = solAt(g), valv = valveAt(g);

  // A 3×3 tent average of f. A free jet genuinely thins as it accelerates, so
  // its cells sit well below 1; smoothing lets that render as one translucent
  // ribbon instead of a cloud of half-full cells.
  float fs = 0.0;
  for (int dy = -1; dy <= 1; dy++)
    for (int dx = -1; dx <= 1; dx++) {
      float w = (dx == 0 ? 2.0 : 1.0) * (dy == 0 ? 2.0 : 1.0);
      fs += w * texelFetch(u_F, clamp(ivec2(g) + ivec2(dx, dy), ivec2(0), ivec2(u_res) - ivec2(1)), 0).r;
    }
  fs /= 16.0;

  vec4 col4 = texelFetch(u_C, ivec2(clamp(g.x, 0.0, u_res.x - 1.0), 0.0), 0);
  float bed = col4.x, dep = col4.y, surf = col4.w;

  // ---- background: a faint metric grid so scale is readable
  vec3 bg = vec3(0.043, 0.055, 0.075);
  vec2 gr = abs(fract(pm / 1.0 - 0.5) - 0.5) / fwidth(pm / 1.0);
  float grid = 1.0 - min(min(gr.x, gr.y), 1.0);
  bg += vec3(0.030, 0.038, 0.050) * grid;

  vec3 c = bg;

  // ---- water body. Opacity follows how much water is actually there, so a
  //      stretched jet reads as thin and a pool reads as solid.
  float wet = smoothstep(0.05, 0.55, fs);
  // Submergence straight from the pressure: p/ρg IS the depth below the local
  // free surface. Reading it off the column reduction instead would break for
  // anything stacked — a tank above a puddle, a pipe under a channel.
  float sub = U.b / max(abs(u_g), 1e-3);
  vec3 water;
  if (u_mode == 0) {
    vec3 shallow = vec3(0.24, 0.56, 0.78);
    vec3 deep    = vec3(0.05, 0.20, 0.42);
    water = mix(shallow, deep, clamp(sub / max(u_hmax, 0.05), 0.0, 1.0));
    water += vec3(0.10, 0.14, 0.16) * clamp(length(U.rg) / max(u_vmax, 0.01), 0.0, 1.0);
  } else if (u_mode == 1) {
    float head = U.b / max(abs(u_g), 1e-3);   // piezometric head above the point (m)
    water = turbo(head / max(u_hmax, 0.05));
  } else if (u_mode == 2) {
    water = turbo(length(U.rg) / max(u_vmax, 0.01));
  } else if (u_mode == 3) {
    float fr = length(U.rg) / sqrt(max(abs(u_g) * dep, 1e-4));
    water = divg(0.5 * clamp(fr, 0.0, 2.0));
  } else {
    ivec2 gi = ivec2(clamp(g, vec2(1.0), u_res - vec2(2.0)));
    float dvdx = texelFetch(u_U, gi + ivec2(1,0), 0).g - texelFetch(u_U, gi - ivec2(1,0), 0).g;
    float dudy = texelFetch(u_U, gi + ivec2(0,1), 0).r - texelFetch(u_U, gi - ivec2(0,1), 0).r;
    float w = (dvdx - dudy) / (2.0 * u_dx);
    water = divg(0.5 + 0.5 * clamp(w / 40.0, -1.0, 1.0));
  }
  c = mix(c, water, wet);

  // ---- free-surface line
  float band = (1.0 - smoothstep(0.0, 0.22, abs(fs - 0.55))) * smoothstep(0.10, 0.35, fs);
  c = mix(c, vec3(0.78, 0.92, 1.0), band * 0.50 * (1.0 - sol));

  // ---- dye
  if (u_dyeOn > 0.5) {
    float dA = F.g, dB = F.b;
    c = mix(c, vec3(0.15, 0.95, 0.85), clamp(dA, 0.0, 1.0) * 0.85 * wet);
    c = mix(c, vec3(1.00, 0.66, 0.20), clamp(dB, 0.0, 1.0) * 0.85 * wet);
  }

  // ---- solids
  vec3 rock = vec3(0.16, 0.17, 0.20);
  float hatch = 0.5 + 0.5 * sin((pm.x + pm.y) * 42.0);
  rock += vec3(0.030) * hatch;
  c = mix(c, rock, sol);
  c = mix(c, u_valve > 0.5 ? vec3(0.86, 0.33, 0.22) : vec3(0.35, 0.72, 0.45), valv * 0.85);

  // ---- pressurised marker: cells above the slot threshold get a sheen so
  //      the free-surface → pressurised transition is legible
  if (u_mode == 0) {
    float pz = smoothstep(1.004, 1.05, f);
    c = mix(c, vec3(0.95, 0.85, 0.55), pz * 0.30 * wet);
  }

  // ---- preview line while dragging a wall
  if (u_guideOn > 0.5) {
    float d = segDist(pm, u_guide.xy, u_guide.zw);
    c = mix(c, vec3(0.55, 0.95, 1.0), 1.0 - smoothstep(u_cursor.z * 0.5, u_cursor.z, d));
  }

  // ---- cursor
  float dc = distance(pm, u_cursor.xy);
  float ring = smoothstep(u_cursor.z + px * 1.6, u_cursor.z, dc)
             - smoothstep(u_cursor.z, u_cursor.z - px * 1.6, dc);
  c += vec3(0.55, 0.85, 1.0) * ring * 0.85;

  o = vec4(pow(clamp(c, 0.0, 1.0), vec3(0.95)), 1.0);
}`;

  return { VS_QUAD, VS_RECT, FS_VEL, FS_VOF, FS_COL, FS_PART, VS_PART, FS_PART_DRAW, FS_DISP };
})();
