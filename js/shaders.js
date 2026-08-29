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
  //                  g = w at the SOUTH face of this cell
  //                  b = p/ρ at the cell centre (m²/s², diagnostic)
  //                  a = ∇·u at the cell centre (diagnostic)
  //   u_F  RGBA32F   r = f (fill fraction / density)
  //                  g = dye A   b = dye B   a = spare
  //   u_S  R8        0 = open, 0.5 = valve, 1 = wall
  const SIM_HEAD = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUv;
// NB: the fragment output is declared by each pass, not here — the vof pass
// needs a location-qualified pair (MRT) when ACCUM is on, and a name can only
// be declared once.

uniform sampler2D u_U, u_F, u_S;
uniform vec2  u_res;          // NX, NY
uniform float u_dx, u_dt;
uniform float u_g;            // signed gravity (m/s², negative = down; 0 = plan view)
uniform float u_gx;           // downstream gravity component: a scene with a
                              // uniform mild slope draws its bed FLAT (grid-
                              // aligned, so no rasterisation staircase to
                              // excite waves) and tilts gravity by S0 instead
uniform float u_c, u_c2;      // slot celerity and its square
uniform float u_valve;        // 1 = valves closed (solid), 0 = open
uniform vec4  u_in;           // left reservoir: level (m), velocity (m/s), on, free
                              // free = 1 pins the level only and lets the head drive the flow
uniform vec2  u_tw;           // right tailwater: level (m), on
uniform vec2  u_inBand;       // z-range the inflow control applies to (bed of the
                              // connected inlet run → min(level, run top)). Without
                              // this the Dirichlet floods any cavity under a raised
                              // bed slab and the prescribed velocity pressurises it
                              // to the clamp — the steep-scene explosion.
uniform vec2  u_twBand;       // same for the right tailwater column
uniform vec2  u_spongeN;      // relaxation-sponge width in columns (inflow, tailwater)
uniform vec4  u_openMode;     // L R B T : 0 wall, 1 open (zero-gradient), 2 outfall
uniform vec4  u_src0, u_src1; // point sources: x, z, radius (m), on
uniform vec4  u_sv0,  u_sv1;  // source velocity x, z and dye A, dye B
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
out vec4 o;
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
// that attenuates acoustics (the "wave damping" slider). With gravity the
// EOS is one-sided and clamped at zero: f < 1 IS the free surface, and a
// cell that cannot stay full simply cavitates, which is what really happens
// downstream of a slammed valve. In plan view (g = 0) there is no free
// surface — the fluid fills the plane — so the EOS goes two-sided: a
// rarefied cell pulls back like a liquid under tension. Without that,
// every strong vortex core slowly cavitates into a hole.
float press(float f, float dv){
  float p = u_c2 * max(f - 1.0, 0.0);
  if (u_g == 0.0) p += u_c2 * min(f - 1.0, 0.0) * smoothstep(0.3, 0.9, f);
  p -= u_bulk * u_c * u_dx * dv * smoothstep(0.90, 1.0, f);
  return (u_g == 0.0) ? p : max(p, 0.0);
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

  float u0 = t0.r, w0 = t0.g;
  float fC = TF(c).r, fW = TF(ivec2(i-1,j)).r, fS = TF(ivec2(i,j-1)).r;
  float sC = SO(c),   sW = SO(ivec2(i-1,j)),   sS = SO(ivec2(i,j-1));

  // --- transverse velocity interpolated onto each face node
  float wAtU = 0.25 * (tW.g + t0.g + tNW.g + tN.g);
  float uAtW = 0.25 * (tS.r + t0.r + tSE.r + tE.r);

  // --- advection
  float un = u0 - dt * ( u0    * ud3(tWW.r, tW.r, u0, tE.r, tEE.r, u0,    dx)
                       + wAtU  * ud3(tSS.r, tS.r, u0, tN.r, tNN.r, wAtU,  dx) );
  float wn = w0 - dt * ( uAtW  * ud3(tWW.g, tW.g, w0, tE.g, tEE.g, uAtW,  dx)
                       + w0    * ud3(tSS.g, tS.g, w0, tN.g, tNN.g, w0,    dx) );

  // --- eddy viscosity (Smagorinsky). Without this the velocity–depth
  //     profile stays laminar-parabolic instead of turbulent-flat.
  float dudx = (tE.r - t0.r) / dx;
  float dwdz = (tN.g - t0.g) / dx;
  float sxy  = 0.5 * ((tN.r - tS.r) + (tE.g - tW.g)) / (2.0 * dx);
  float smag = sqrt(2.0*(dudx*dudx + dwdz*dwdz) + 4.0*sxy*sxy);
  float nuT  = u_nu + (u_cs*dx)*(u_cs*dx)*smag;

  // --- wall-aware Laplacian: a solid neighbour reflects (no-slip) or mirrors
  float sUp = max(SO(ivec2(i,j+1)), SO(ivec2(i-1,j+1)));
  float sDn = max(SO(ivec2(i,j-1)), SO(ivec2(i-1,j-1)));
  float sLf = max(SO(ivec2(i-1,j)), SO(ivec2(i-1,j-1)));
  float sRt = max(SO(ivec2(i+1,j)), SO(ivec2(i+1,j-1)));
  float ghost = mix(-1.0, 1.0, u_slip);
  float uN = mix(tN.r, ghost*u0, sUp), uS = mix(tS.r, ghost*u0, sDn);
  float wL = mix(tW.g, ghost*w0, sLf), wR = mix(tE.g, ghost*w0, sRt);
  un += dt * nuT * (tE.r + tW.r + uN + uS - 4.0*u0) / (dx*dx);
  wn += dt * nuT * (wR + wL + tN.g + tS.g - 4.0*w0) / (dx*dx);

  // --- gravity, only where there is water to pull on
  float fFu = max(fC, fW), fFw = max(fC, fS);
  wn += dt * u_g * smoothstep(0.0, 0.05, fFw);
  un += dt * u_gx * smoothstep(0.0, 0.05, fFu);

  // --- bed friction: a wall function applied in the cells touching a solid,
  //     integrated implicitly so any roughness is stable
  float spU = sqrt(un*un + wAtU*wAtU) + 1e-6;
  float spW = sqrt(wn*wn + uAtW*uAtW) + 1e-6;
  un /= 1.0 + dt * u_cf * spU * max(sUp, sDn) / dx;
  wn /= 1.0 + dt * u_cf * spW * max(sLf, sRt) / dx;

  // --- pressure gradient (three cell-centred divergences from the stencil)
  float dvC = (tE.r  - t0.r + tN.g  - t0.g) / dx;
  float dvW = (t0.r  - tW.r + tNW.g - tW.g) / dx;
  float dvS = (tSE.r - tS.r + t0.g  - tS.g) / dx;
  float pC = press(fC, dvC);
  un -= dt * (pC - press(fW, dvW)) / dx;
  wn -= dt * (pC - press(fS, dvS)) / dx;

  // --- void handling. Hard-zeroing the velocity in empty cells makes the air
  //     behave like a rigid medium, and the fake shear layer shreds any free
  //     jet within a metre of leaving its nozzle. Instead let the velocity
  //     advect and diffuse out into the void — a cheap standing-in for the
  //     usual free-surface velocity extrapolation — and only bleed it away
  //     slowly, so still air stays still. Nothing forces a void (gravity and
  //     ∇p are both gated on f), so this cannot run away.
  float dryU = 1.0 - smoothstep(0.0, 0.02, fFu);
  float dryW = 1.0 - smoothstep(0.0, 0.02, fFw);
  un *= 1.0 - min(dt * 1.5 * dryU, 1.0);
  wn *= 1.0 - min(dt * 1.5 * dryW, 1.0);

  // --- transport-consistency cap. The VOF donor limiter cannot move mass
  //     faster than a quarter cell per substep (dx/4dt), but nothing above
  //     stops the *velocity* in a spray cell from integrating past that —
  //     gravity keeps pumping while the mass stays put, the two fields
  //     decouple, and the runaway ends at the ±80 rail where it drags water
  //     out of any pinned Dirichlet ghost it touches (the tailwater-scene
  //     explosion). So in partial-fill cells, hold the speed at what the
  //     volume flux can actually follow; solid water keeps the wide NaN
  //     guard — pressurised cells (f ≈ 1) never bind the donor cap.
  float capBase = 0.20 * dx / dt;
  float capU = mix(capBase, 80.0, smoothstep(0.05, 0.50, fFu));
  float capW = mix(capBase, 80.0, smoothstep(0.05, 0.50, fFw));
  un = clamp(un, -capU, capU);
  wn = clamp(wn, -capW, capW);

  // --- prescribed sources
  vec2 pu = vec2(float(i),       float(j) + 0.5) * dx;   // u-node position
  vec2 pw = vec2(float(i) + 0.5, float(j)      ) * dx;   // w-node position
  if (u_src0.w > 0.5) {
    if (distance(pu, u_src0.xy) < u_src0.z) un = u_sv0.x;
    if (distance(pw, u_src0.xy) < u_src0.z) wn = u_sv0.y;
  }
  if (u_src1.w > 0.5) {
    if (distance(pu, u_src1.xy) < u_src1.z) un = u_sv1.x;
    if (distance(pw, u_src1.xy) < u_src1.z) wn = u_sv1.y;
  }
  if (u_in.z > 0.5 && u_in.w < 0.5 && i == 1) {
    // Feathered plug: a hard velocity step at the waterline waterfalls into
    // the slightly drawn-down interior surface and sheds ripples forever.
    // The top three cells taper to zero instead (inletVel() compensates the
    // lost discharge), so the surface at the inlet can breathe. A submerged
    // duct (band top below the nominal level, e.g. plan view) keeps the
    // full plug — there is no free surface there to protect.
    float taper = (u_inBand.y < u_in.x - 1e-4)
      ? 1.0 : smoothstep(u_inBand.y, u_inBand.y - 3.0 * u_dx, pu.y);
    un = (pu.y > u_inBand.x && pu.y < u_inBand.y) ? u_in.y * taper : 0.0;
  }
  if (u_wave.z > 0.5 && i == int(u_wave.w) && fFu > 0.5) {
    un = u_wave.x * u_wave.y * cos(u_wave.y * u_time);   // piston wavemaker
  }

  // --- open-boundary ring. The outermost cells see a clamped stencil, and
  //     with a pinned Dirichlet f their momentum update is junk that leaks
  //     back into the domain through the advection stencil (tE.g / tN.r of
  //     the last interior column). So: tangential velocity is a zero-gradient
  //     copy of the interior neighbour, and the exchange face keeps its
  //     momentum update — that is what lets a level control drive flow
  //     through the edge — but clamped to the transport limit. Closed edges
  //     are solid ring cells and are zeroed just below anyway.
  // A level-controlled edge gets a *physical* exchange bound as well: nothing
  // can flow to or from a pond of level L faster than the torricellian
  // sqrt(2gL). The transport cap alone leaves ~12 m/s of headroom, and the
  // one-cell Dirichlet can resonate with the pond slosh right up to it —
  // the drowned-jump scenes used to pump themselves apart at t ≈ 40 s.
  float gMag = abs(u_g);
  float capR = (u_tw.y > 0.5) ? sqrt(2.0 * gMag * max(u_tw.x, 0.05)) + 1.0 : capBase;
  float capL = (u_in.z > 0.5) ? sqrt(2.0 * gMag * max(u_in.x, 0.05)) + 1.0 : capBase;
  if (i == 0)          wn = tE.g;
  if (i == 1 && u_in.z > 0.5 && u_in.w > 0.5) un = clamp(un, -capL, capL);
  if (i == NXY.x - 1) { un = clamp(un, -min(capR, capBase), min(capR, capBase)); wn = tW.g; }
  if (j == 0)          un = tN.r;
  if (j == NXY.y - 1) { wn = clamp(wn, -capBase, capBase); un = tS.r; }

  // --- no flux through solids; outermost faces are outside the domain
  if (sC > 0.5 || sW > 0.5) un = 0.0;
  if (sC > 0.5 || sS > 0.5) wn = 0.0;
  if (i == 0) un = 0.0;
  if (j == 0) wn = 0.0;

  // Belt and braces: one NaN anywhere poisons the whole field for good, and
  // a scene that has silently died is worse than one that clips. Written as
  // an explicit range test rather than isnan() or a self-comparison, both of
  // which a fast-math shader compiler is entitled to fold away.
  un = (un > -80.0 && un < 80.0) ? un : (un > 0.0 ? 80.0 : (un < 0.0 ? -80.0 : 0.0));
  wn = (wn > -80.0 && wn < 80.0) ? wn : (wn > 0.0 ? 80.0 : (wn < 0.0 ? -80.0 : 0.0));
  o = vec4(un, wn, pC, dvC);
}`;

  // ------------------------------------------------------------ pass 2: VOF
  // Flux-form advection of f. Because both neighbours of a face compute the
  // identical face flux, total volume is conserved to machine precision —
  // that is what makes the mass-balance readout trustworthy.
  const FS_VOF = SIM_HEAD + `
layout(location = 0) out vec4 o;
#ifdef ACCUM
// The transport accumulator: running means of the pass's OWN face fluxes.
// (<F^E>, <F^N>, <S>, unused). Written here, never read by any pass that
// influences the solution — it is a diagnostic, not a state variable.
layout(location = 1) out vec4 oA;
uniform sampler2D u_A;
uniform float u_Tacc;                  // window BEFORE this substep
#define ACC_KEEP  oA = texelFetch(u_A, c, 0);
#else
#define ACC_KEEP
#endif
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

// One face's limited flux, as ONE expression. Both neighbours of a face call
// this with the same arguments, so F^E(i,j) IS F^W(i+1,j) by construction
// rather than by coincidence — which is what lets the transport accumulator
// store each face once, and what the Conservation section of
// docs/engineering-notes.md requires. Nothing here is new arithmetic; it is
// the same code, lifted: fluxX(i,j) is the old FE, fluxX(i-1,j) the old FW,
// fluxZ(i,j) the old FN, fluxZ(i,j-1) the old FS, term for term.
// fluxX and fluxZ stay separate near-duplicates on purpose: the x and z
// gradient stencils are genuinely asymmetric and unifying them would only
// hide that behind a swizzle.
float fluxX(int i, int j, float lim4){
  float fm = TF(ivec2(i,j)).r, fp = TF(ivec2(i+1,j)).r;
  float a  = TU(ivec2(i+1,j)).r;
  float ff = faceVal(TF(ivec2(i-1,j)).r, fm, fp, TF(ivec2(i+2,j)).r, a);
  float cf = 0.0;
  if (u_ca > 0.0) {
    float aC = min(fm,1.0), aE = min(fp,1.0);
    float aN  = min(TF(ivec2(i,  j+1)).r,1.0), aS  = min(TF(ivec2(i,  j-1)).r,1.0);
    float aNE = min(TF(ivec2(i+1,j+1)).r,1.0), aSE = min(TF(ivec2(i+1,j-1)).r,1.0);
    float gx = (aE - aC) / u_dx;
    float gz = ((aN + aNE) - (aS + aSE)) / (4.0*u_dx);
    float gm = sqrt(gx*gx + gz*gz) + 1e-8, am = 0.5*(aE + aC);
    cf = u_ca * abs(a) * am * (1.0 - am) * gx / gm;
  }
  return clamp(a*ff + cf, -lim4 * fp, lim4 * fm);
}
float fluxZ(int i, int j, float lim4){
  float fm = TF(ivec2(i,j)).r, fp = TF(ivec2(i,j+1)).r;
  float a  = TU(ivec2(i,j+1)).g;
  float ff = faceVal(TF(ivec2(i,j-1)).r, fm, fp, TF(ivec2(i,j+2)).r, a);
  float cf = 0.0;
  if (u_ca > 0.0) {
    float aC = min(fm,1.0), aN = min(fp,1.0);
    float aE  = min(TF(ivec2(i+1,j  )).r,1.0), aW  = min(TF(ivec2(i-1,j  )).r,1.0);
    float aNE = min(TF(ivec2(i+1,j+1)).r,1.0), aNW = min(TF(ivec2(i-1,j+1)).r,1.0);
    float gz = (aN - aC) / u_dx;
    float gx = ((aNE + aE) - (aNW + aW)) / (4.0*u_dx);
    float gm = sqrt(gx*gx + gz*gz) + 1e-8, am = 0.5*(aN + aC);
    cf = u_ca * abs(a) * am * (1.0 - am) * gz / gm;
  }
  return clamp(a*ff + cf, -lim4 * fp, lim4 * fm);
}

void main(){
  NXY = ivec2(u_res);
  ivec2 c = ivec2(gl_FragCoord.xy);
  int i = c.x, j = c.y;
  float dx = u_dx, dt = u_dt;
  float x = (float(i) + 0.5) * dx, z = (float(j) + 0.5) * dx;
  float gMag = abs(u_g);

  // A solid cell has no transport of its own, but the accumulator must be
  // PASSED THROUGH, not zeroed: writing vec4(0) here would erase the history
  // of a cell the mask later reopens, and MRT has no way to leave an
  // attachment untouched.
  if (SO(c) > 0.5) { o = vec4(0.0); ACC_KEEP return; }

  // --- ghost ring: zero-gradient outflow, or a Dirichlet level control
  bool gL = (i == 0), gR = (i == NXY.x - 1), gB = (j == 0), gT = (j == NXY.y - 1);
  if (gL || gR || gB || gT) {
    ivec2 s = c;
    if (gL) s.x = 1; if (gR) s.x = NXY.x - 2;
    if (gB) s.y = 1; if (gT) s.y = NXY.y - 2;
    vec4 m = TF(s);
    if (gL) {
      if (u_in.z > 0.5) {                   // upstream reservoir
        m.r = (z > u_inBand.x && z < u_in.x) ? 1.0 + gMag * (u_in.x - z) / u_c2 : 0.0;
        m.g = (u_dyeLine.y > 0.5 && fract(u_time / max(u_dyeLine.x, 0.05)) < 0.07) ? 1.0 : 0.0;
        m.b = 0.0;
      } else if (u_openMode.x > 1.5) m = vec4(0.0);
    }
    if (gR) {
      if (u_tw.y > 0.5) {                   // downstream level control
        m.r = (z > u_twBand.x && z < u_tw.x) ? 1.0 + gMag * (u_tw.x - z) / u_c2 : 0.0;
      } else if (u_openMode.y > 1.5) m = vec4(0.0);
    }
    // Outfall ghosts are held EMPTY, so ∇p spills the last interior column
    // over the edge — a brink. A plain open edge is zero-gradient: transparent
    // to through-flow but it will happily let a still pond sit against it.
    if (gB && u_openMode.z > 1.5) m = vec4(0.0);
    if (gT && u_openMode.w > 1.5) m = vec4(0.0);
#ifdef ACCUM
    // Ghost fill is boundary state, not conserved storage — but the flux
    // through its inner face is real, and interior column 1 / row 1 cannot
    // store it (each cell owns only its EAST and NORTH face). Same
    // fluxX/fluxZ call the interior neighbour makes, so it is the same
    // number, not an approximation of it. The corner texel (0,0) is never
    // read back: interior cells start at (1,1), whose west face lives at
    // (0,1) and whose south face lives at (1,0).
    vec4 Ag = texelFetch(u_A, c, 0);
    float lim4g = 0.25 * dx / dt;
    float kg = dt / max(u_Tacc + dt, 1e-9);
    if (gL) Ag.r = Ag.r + kg * (fluxX(i, j, lim4g) - Ag.r);
    if (gB) Ag.g = Ag.g + kg * (fluxZ(i, j, lim4g) - Ag.g);
    oA = Ag;
#endif
    o = m; return;
  }

  // --- stencil (f in .r, dyes in .g/.b — one fetch serves both). The wider
  //     f stencil the advection needs is fetched inside fluxX/fluxZ; what is
  //     left here is what the dye transport and the divergence still use.
  vec4 F0 = TF(c);
  vec4 Fw = TF(ivec2(i-1,j  )), Fe = TF(ivec2(i+1,j  ));
  vec4 Fs = TF(ivec2(i,  j-1)), Fn = TF(ivec2(i,  j+1));

  float fC = F0.r;
  float uW = TU(c).r, uE = TU(ivec2(i+1,j)).r;
  float wS = TU(c).g, wN = TU(ivec2(i,j+1)).g;

  // Donor-cell positivity limiter. A cell can only lose through four faces,
  // so capping each outgoing flux at a quarter of the donor's contents
  // guarantees f never goes negative — WITHOUT a clamp. That distinction is
  // the whole ball game: clamping a negative f back to zero invents water,
  // and at a few thousand substeps a second across every surface and spray
  // cell in the domain it invents a *lot* of it. This version is exactly
  // conservative because both neighbours of a face pick the same donor from
  // the sign of the same flux, and therefore agree on the same limit — which
  // is now literally the same call: this cell's FW is its west neighbour's
  // FE, argument for argument.
  float lim4 = 0.25 * dx / dt;
  float FW = fluxX(i-1, j, lim4), FE = fluxX(i, j, lim4);
  float FS = fluxZ(i, j-1, lim4), FN = fluxZ(i, j, lim4);
  // The conservative candidate, kept UNCLAMPED: everything below (the range
  // cap, the sponges, the point sources) is a source term, and <S> is exactly
  // what they add. Clamp first and the balance loses the term it is meant to
  // report.
  float fCons = fC - dt * ((FE - FW) + (FN - FS)) / dx;
  float fNew  = min(fCons, 8.0);

  // --- relaxation sponge at level-controlled edges. A one-cell Dirichlet is
  //     a hard impedance step: pond slosh reflects off it, and with the
  //     momentum update supplying the exchange velocity the reflection can
  //     pump (that was the drowned-jump blow-up). Nudging f toward the
  //     hydrostatic target over a band of columns instead makes the boundary
  //     a soft bath — same level, no resonator. Mass conservation is
  //     intentionally given up inside the sponge: it IS the reservoir. The
  //     width comes from the scene (a reservoir compartment feeding a pipe
  //     needs the whole compartment held, or it drains and the pipe
  //     cavitates); the nudge is asymmetric — deficits fill hard, crests
  //     drain gently — because deleting wave crests column-by-column against
  //     an incoming jet paints standing striations in the pond.
  // Tailwater side: de-resonance only, so the quadratic ramp keeps the
  // sponge's reach shallow — a linear fill this side amplified the drowned
  // jump's surges instead of absorbing them.
  if (u_tw.y > 0.5 && u_spongeN.y > 0.5 && float(i) > u_res.x - 2.0 - u_spongeN.y) {
    float s = (float(i) - (u_res.x - 2.0 - u_spongeN.y)) / u_spongeN.y;
    float tgt = (z > u_twBand.x && z < u_tw.x) ? 1.0 + gMag * (u_tw.x - z) / u_c2
              : (z >= u_tw.x ? 0.0 : fNew);
    float rate = tgt > fNew ? 8.0 * s * s : 2.0 * s * s;
    fNew = mix(fNew, tgt, min(dt * rate, 1.0));
  }
  // Inflow side. Head-driven: this sponge IS the supply, so it fills with a
  // linear ramp — a reservoir compartment held only at its outer columns
  // draws down and starves the pipe. Prescribed-q: the sponge's job is only
  // to absorb the reach seiche (the pinned inlet is otherwise a perfect
  // long-wave reflector, and M2 breathed at the inlet–brink round-trip
  // period for ever), so it keeps the gentle quadratic ramp.
  if (u_in.z > 0.5 && u_spongeN.x > 0.5 && float(i) < 1.0 + u_spongeN.x) {
    float s = (1.0 + u_spongeN.x - float(i)) / u_spongeN.x;
    float tgt = (z > u_inBand.x && z < u_in.x) ? 1.0 + gMag * (u_in.x - z) / u_c2
              : (z >= u_in.x ? 0.0 : fNew);
    float rate = (u_in.w > 0.5) ? (tgt > fNew ? 12.0 * s : 2.0 * s * s)
                                : (tgt > fNew ? 8.0 * s * s : 2.0 * s * s);
    fNew = mix(fNew, tgt, min(dt * rate, 1.0));
  }

  // --- dye rides along (advective form, first-order upwind is plenty)
  float div = ((uE - uW) + (wN - wS)) / dx;
  vec2 dC = F0.gb;
  vec2 dWu = uW > 0.0 ? Fw.gb : dC, dEu = uE > 0.0 ? dC : Fe.gb;
  vec2 dSu = wS > 0.0 ? Fs.gb : dC, dNu = wN > 0.0 ? dC : Fn.gb;
  vec2 dNew = dC - dt * ((uE*dEu - uW*dWu + wN*dNu - wS*dSu) / dx - dC*div);
  dNew *= 1.0 - dt * u_dyeDecay;
  dNew = clamp(dNew, 0.0, 1.0);

  // --- point sources add volume and colour
  if (u_src0.w > 0.5 && distance(vec2(x,z), u_src0.xy) < u_src0.z) {
    fNew = max(fNew, 1.0); dNew = max(dNew, u_sv0.zw);
  }
  if (u_src1.w > 0.5 && distance(vec2(x,z), u_src1.xy) < u_src1.z) {
    fNew = max(fNew, 1.0); dNew = max(dNew, u_sv1.zw);
  }

  fNew = (fNew > 0.0 && fNew < 8.0) ? fNew : (fNew >= 8.0 ? 8.0 : 0.0);
  o = vec4(fNew, dNew, 0.0);
#ifdef ACCUM
  // Running means over the window, weight h/(T+h) with T the window BEFORE
  // this substep — so after n substeps each channel is the exact
  // time-weighted mean of what the pass actually did.
  //
  // S is a RATE, not an increment: the balance of docs/averaging.md §5 has
  // units of fill per second, so it is (fNew − fCons)/dt. Weighting the
  // increment (fNew − fCons) by h instead would put an extra factor of time
  // in the balance — RECON test A6 pins this convention on the JS side.
  vec4 A = texelFetch(u_A, c, 0);
  float k = dt / max(u_Tacc + dt, 1e-9);
  float Srate = (fNew - fCons) / dt;
  oA = vec4(A.r + k * (FE - A.r),
            A.g + k * (FN - A.g),
            A.b + k * (Srate - A.b), 0.0);
#endif
}`;

  // The #define must follow #version, which has to be the first line of the
  // source. Compiled as a separate program so a session that never opens
  // Average pays exactly today's cost: an MRT bound to a dummy target still
  // costs the bandwidth of a second full-resolution RGBA32F write per substep.
  const withAccum = (src) => src.replace(/^(#version[^\n]*\n)/, "$1#define ACCUM 1\n");
  const FS_VOF_ACC = withAccum(FS_VOF);

  // ------------------------------------------------- pass 3: column reduce
  // One texel per grid column: bed level, depth, unit discharge, surface.
  // Everything the open-channel overlay needs (d_c, d_n, Fr, energy line)
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
  float d = 0.0, q = 0.0, top = float(jb) * u_dx;
  int dry = 0;
  for (int j = jb; j < NY - 1; j++) {
    if (SO(ivec2(i,j)) > 0.5) break;          // soffit / obstruction
    float f  = min(texelFetch(u_F, ivec2(i,j), 0).r, 1.0);
    if (f < 0.25) { dry++; if (dry > 2) break; continue; }
    dry = 0;
    float uc = 0.5 * (texelFetch(u_U, ivec2(i,  j), 0).r
                    + texelFetch(u_U, ivec2(i+1,j), 0).r);
    d += f * u_dx;
    q += f * uc * u_dx;
    if (f > 0.5) top = (float(j) + 1.0) * u_dx;
  }
  o = vec4(float(jb) * u_dx, d, q, top);
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
  vec2 pw = clamp(vec2(g.x - 0.5, g.y      ), lo, hi);
  ivec2 iu = ivec2(pu); vec2 fu = pu - vec2(iu);
  ivec2 iw = ivec2(pw); vec2 fw = pw - vec2(iw);
  float u = mix(mix(texelFetch(u_U, iu,             0).r, texelFetch(u_U, iu+ivec2(1,0), 0).r, fu.x),
                mix(texelFetch(u_U, iu+ivec2(0,1),  0).r, texelFetch(u_U, iu+ivec2(1,1), 0).r, fu.x), fu.y);
  float w = mix(mix(texelFetch(u_U, iw,             0).g, texelFetch(u_U, iw+ivec2(1,0), 0).g, fw.x),
                mix(texelFetch(u_U, iw+ivec2(0,1),  0).g, texelFetch(u_U, iw+ivec2(1,1), 0).g, fw.x), fw.y);
  return vec2(u, w);
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
uniform float u_tilt;         // scene tiltS0: elevation is z − S₀x when set
uniform int   u_mode;         // 0 water 1 head 2 speed 3 Froude 4 vorticity
                              // 5 momentum flux 6 piezometric head
uniform float u_vmax, u_hmax; // colour-scale maxima
uniform float u_dyeOn;
uniform vec4  u_cursor;       // x, z (m), radius (m), tool tint
uniform vec4  u_guide;        // preview line x0,z0,x1,z1 (m); w<0 = off
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

  // Linear interpolation between columns — the reduction is per-column, and
  // sampling it nearest paints hard vertical colour steps wherever the depth
  // jumps a cell (glaring in the Froude view).
  float gx = clamp(g.x - 0.5, 0.0, u_res.x - 1.001);
  int ci = int(gx);
  vec4 col4 = mix(texelFetch(u_C, ivec2(ci, 0), 0),
                  texelFetch(u_C, ivec2(min(ci + 1, int(u_res.x) - 1), 0), 0),
                  gx - float(ci));
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
    float head = U.b / max(abs(u_g), 1e-3);   // pressure head p/ρg: submergence below the surface (m)
    water = turbo(head / max(u_hmax, 0.05));
  } else if (u_mode == 2) {
    water = turbo(length(U.rg) / max(u_vmax, 0.01));
  } else if (u_mode == 3) {
    // STREAMWISE velocity, not the 2D speed magnitude. A Froude number is
    // u/√(gd) — the vertical component is not part of it, and including it
    // paints vertical warm streaks down every plunging wave face: measured on
    // a23's apron, |w| exceeds |u| in 30% of wet cells and |u,w| triples the
    // cells that render supercritical (1.5% against 0.5%). Because the ramp
    // below is diverging about Fr = 1, that reads as violent banding even
    // where the reach is comfortably subcritical. The depth is per-column so
    // it cannot cause this; measured column-to-column jitter is under 5%.
    float fr = abs(U.r) / sqrt(max(abs(u_g) * dep, 1e-4));
    water = divg(0.5 * clamp(fr, 0.0, 2.0));
  } else if (u_mode == 4) {
    ivec2 gi = ivec2(clamp(g, vec2(1.0), u_res - vec2(2.0)));
    float dwdx = texelFetch(u_U, gi + ivec2(1,0), 0).g - texelFetch(u_U, gi - ivec2(1,0), 0).g;
    float dudz = texelFetch(u_U, gi + ivec2(0,1), 0).r - texelFetch(u_U, gi - ivec2(0,1), 0).r;
    float vort = (dwdx - dudz) / (2.0 * u_dx);
    water = divg(0.5 + 0.5 * clamp(vort / 40.0, -1.0, 1.0));
  } else if (u_mode == 6) {
    // Piezometric head h = z + p/ρg — the potential whose gradient drives the
    // flow. Constant over the depth wherever the flow is hydrostatic, so the
    // bands stand VERTICAL through a backwater or a uniform reach and bend
    // exactly where vertical accelerations matter: weir crests and brinks
    // (h sags), a chute toe (h bulges), gate contractions, jump rollers.
    // A tilted-gravity scene draws a flat bed and carries S₀ in gravity, so the
    // elevation term is z − S₀x there.
    float hp = pm.y - u_tilt * pm.x + U.b / max(abs(u_g), 1e-3);
    water = turbo(hp / max(u_res.y * u_dx, 0.05));
  } else {
    // Momentum flux per unit volume, ρu·|u| with ρ ∝ f. Free because the
    // display pass runs once per FRAME, not once per substep — it is the two
    // simulation passes that cost, and this adds nothing to them. Signed by
    // the streamwise direction so a returning roller or an undertow reads
    // opposite to the flow that drives it, which is the thing worth seeing:
    // where the momentum actually goes in a jump or under a breaker.
    float sp = length(U.rg);
    float mom = f * U.r * sp;
    water = divg(0.5 + 0.5 * clamp(mom / max(u_vmax * u_vmax * 0.5, 0.01), -1.0, 1.0));
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

  // ------------------------------------------------ averaging: Favre field
  /** One running weighted-mean update of (f u_c, f w_c, f, P).
   *
   *  Collocation is the trap here: u lives on the west face and w on the
   *  south face, so both are averaged to the CENTRE before being weighted by
   *  f — exactly as FS_COL does it. Weighting f by the west-face velocity
   *  alone puts a directional bias in every mean.
   *
   *  The weight is h/(T+h) with T held on the CPU, so this is the same
   *  formula as RECON.accumStep and is tested there. */
  const FS_ACC = `#version 300 es
precision highp float;
precision highp sampler2D;
out vec4 o;
uniform sampler2D u_A, u_U, u_F;
uniform vec2  u_res;
uniform float u_T, u_dt;

ivec2 CL(ivec2 c){ return clamp(c, ivec2(0), ivec2(u_res) - ivec2(1)); }

void main(){
  ivec2 c = ivec2(gl_FragCoord.xy);
  vec4 A = texelFetch(u_A, c, 0);
  vec4 U = texelFetch(u_U, c, 0);
  float f  = texelFetch(u_F, c, 0).r;
  float uc = 0.5 * (U.r + texelFetch(u_U, CL(c + ivec2(1,0)), 0).r);
  float wc = 0.5 * (U.g + texelFetch(u_U, CL(c + ivec2(0,1)), 0).g);
  vec4 phi = vec4(f * uc, f * wc, f, U.b);
  float k = u_dt / max(u_T + u_dt, 1e-9);
  o = A + k * (phi - A);
}`;

  return { VS_QUAD, VS_RECT, FS_VEL, FS_VOF, FS_VOF_ACC, FS_COL, FS_PART, VS_PART,
           FS_PART_DRAW, FS_DISP, FS_ACC };
})();
